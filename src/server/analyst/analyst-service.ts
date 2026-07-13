import { generateText } from "ai";
import { z } from "zod";
import type { Observation } from "@/domain/observation";
import { hasLLM, llmModel } from "@/server/ai/model-config";
import { listObservations } from "@/server/repositories/observations";
import { buildDigest, buildNarrativeGuardrail } from "@/server/reporting/digest";
import type { EvidenceItem } from "@/components/domain/EvidencePopover";

export const AnalystRequestSchema = z.object({
  question: z.string().trim().min(1).max(800),
});

export type AnalystResponse = {
  answer: string;
  confidence: "low" | "medium" | "high";
  sampleSize: number;
  evidence: EvidenceItem[];
  suggestedActions: string[];
};

function cleanAnalystText(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^---+$/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function excerptFor(transcript: string, terms: string[]): string {
  const text = transcript.trim();
  if (!text) return "Transcript evidence unavailable.";
  const normalized = text.toLowerCase();
  const tokens = terms
    .flatMap((term) => term.toLowerCase().split(/[^a-z0-9]+/))
    .filter((term) => term.length >= 4);
  const token = tokens.find((term) => normalized.includes(term));
  const index = token ? normalized.indexOf(token) : 0;
  const start = Math.max(0, index - 90);
  const end = Math.min(text.length, index + 220);
  return `${start > 0 ? "..." : ""}${text.slice(start, end)}${end < text.length ? "..." : ""}`;
}

function evidenceFor(observations: Observation[], terms: string[]): EvidenceItem[] {
  const normalizedTerms = terms.map((term) => term.toLowerCase()).filter(Boolean);
  return observations
    .filter((observation) => {
      const haystack = [
        observation.transcript,
        observation.extraction.summary,
        ...observation.extraction.questionsAsked,
        ...observation.extraction.objections.map((item) => `${item.type} ${item.detail}`),
        ...observation.extraction.amenities.map((item) => `${item.name} ${item.detail}`),
      ]
        .join(" ")
        .toLowerCase();
      return normalizedTerms.length === 0 || normalizedTerms.some((term) => haystack.includes(term));
    })
    .slice(0, 5)
    .map((observation) => ({
      id: observation.id,
      label: observation.extraction.summary || "Observation",
      excerpt: excerptFor(observation.transcript, terms),
      meta: [observation.hostName, observation.floorPlan, observation.source].filter(Boolean).join(" · "),
    }));
}

function keywordTerms(question: string): string[] {
  return question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 3)
    .slice(0, 12);
}

function heuristicAnswer(question: string, observations: Observation[]): AnalystResponse {
  const digest = buildDigest(observations);
  const guardrail = buildNarrativeGuardrail(digest, observations);
  const terms = keywordTerms(question);
  const q = question.toLowerCase();
  const evidence = evidenceFor(observations, terms);

  let answer: string;
  if (q.includes("parking") || q.includes("objection")) {
    const parking = digest.topObjections.find((item) => item.type === "parking");
    const top = digest.topObjections[0];
    answer = parking
      ? `Parking appears ${parking.count} time${parking.count === 1 ? "" : "s"} in the current corpus. Treat it as ${guardrail.lowSample ? "an early signal" : "a directional operating signal"} until more live captures are available.`
      : top
        ? `${top.label} is currently the leading objection with ${top.count} mention${top.count === 1 ? "" : "s"}. Parking is not yet the dominant objection in captured evidence.`
        : "No objection pattern is visible yet because the corpus is empty or too thin.";
  } else if (q.includes("amenit")) {
    const top = digest.amenityRanking[0];
    answer = top
      ? `${top.label} is the most-discussed amenity with ${top.mentions} mention${top.mentions === 1 ? "" : "s"} and net ${top.net >= 0 ? "+" : ""}${top.net} sentiment. This should be read with the current sample-size guardrail.`
      : "No amenity pattern is visible yet.";
  } else if (q.includes("sentiment")) {
    answer = `Average sentiment is ${digest.avgSentiment ?? "not available"} on the -2 to +2 scale across ${digest.totalTours} observation${digest.totalTours === 1 ? "" : "s"}. ${guardrail.confidenceLanguage}`;
  } else {
    answer = `The current corpus contains ${digest.totalTours} observation${digest.totalTours === 1 ? "" : "s"}, ${digest.intentFunnel.hot} hot lead${digest.intentFunnel.hot === 1 ? "" : "s"}, and ${digest.topObjections[0]?.label ?? "no recurring objection"} as the leading objection signal. ${guardrail.confidenceLanguage}`;
  }

  return {
    answer,
    confidence: guardrail.lowSample ? "low" : guardrail.label === "directional read" ? "medium" : "high",
    sampleSize: observations.length,
    evidence,
    suggestedActions: [
      "Inspect supporting transcripts before changing policy.",
      "Increase live capture volume before calling this a trend.",
      "Promote repeated questions into host talk tracks when evidence count rises.",
    ],
  };
}

export async function answerAnalystQuestion(question: string): Promise<AnalystResponse> {
  const observations = await listObservations();
  const fallback = heuristicAnswer(question, observations);
  if (!hasLLM() || observations.length === 0) return fallback;

  const digest = buildDigest(observations);
  const guardrail = buildNarrativeGuardrail(digest, observations);
  const evidence = fallback.evidence;
  const compact = {
    question,
    guardrail,
    digest: {
      totalTours: digest.totalTours,
      last7: digest.last7,
      prev7: digest.prev7,
      avgSentiment: digest.avgSentiment,
      intentFunnel: digest.intentFunnel,
      topObjections: digest.topObjections.slice(0, 5),
      amenityRanking: digest.amenityRanking.slice(0, 5),
      topQuestions: digest.topQuestions.slice(0, 5),
    },
    evidence,
  };

  try {
    const { text } = await generateText({
      model: llmModel(),
      system:
        "You are Utah City's senior business analyst. Answer only from the provided aggregates and evidence. Be concise. Use confidence-aware language. Do not make protected-class housing recommendations. If sample size is low, say so. Plain text only: no markdown headings, no bullets, no separators.",
      prompt: JSON.stringify(compact, null, 2),
    });
    return {
      ...fallback,
      answer: cleanAnalystText(text),
    };
  } catch (error) {
    console.error("[analyst] LLM answer failed:", error);
    return fallback;
  }
}
