import { generateText } from "ai";
import { z } from "zod";
import type { Observation } from "@/domain/observation";
import { GOOGLE_MODELS, getGoogleModel, hasGoogleKey, hasLLM, llmModel } from "@/server/ai/model-config";
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
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^---+$/gm, "")
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
  const terms = keywordTerms(question);
  const matchedEvidence = evidenceFor(observations, terms);
  const evidence = matchedEvidence.length > 0 ? matchedEvidence : evidenceFor(observations, []);

  // Pass rich observation context so Gemini can cite real resident names and debriefs
  const observationsContext = observations.map((o) => ({
    name: o.hostName,
    unitOrFloorPlan: o.floorPlan,
    prospectTag: o.prospectTag,
    summary: o.extraction.summary,
    transcript: o.transcript,
    objections: o.extraction.objections.map((obj) => `${obj.type}: ${obj.detail}`),
    amenities: o.extraction.amenities.map((a) => `${a.name} (${a.reaction}): ${a.detail}`),
    sentiment: o.extraction.overallSentiment,
  }));

  const payload = {
    userQuestion: question,
    totalObservationsInCorpus: observations.length,
    activeResidentObservations: observationsContext,
    highLevelMetrics: {
      averageSentiment: digest.avgSentiment,
      topObjectionSignals: digest.topObjections,
      topAmenitySignals: digest.amenityRanking,
    },
  };

  const modelsToTry = hasGoogleKey()
    ? GOOGLE_MODELS.map((m) => getGoogleModel(m))
    : [llmModel()];

  let lastError: unknown = null;
  for (const model of modelsToTry) {
    try {
      const { text } = await generateText({
        model,
        system: `You are Utah City's Senior Intelligence Analyst. You provide direct, articulate, and insightful analysis to executive leadership based on resident feedback and tour debriefs from 120 & 220 Bend and Utah City.

Core guidelines:
1. Speak naturally, intelligently, and directly like an expert analyst pair-programming with leadership.
2. DO NOT prepend canned corporate boilerplate (e.g. NEVER start with "Capture volume is sufficient for an operating trend read based on N recorded tours"). Jump straight into the insight.
3. If the user sends a greeting or conversational query (like "hi", "hello", "hey", "who are you?"), greet them warmly in 1-2 friendly sentences, introduce yourself as Utah City's Intelligence Analyst, and suggest 3 specific topics they can ask you about (e.g. staff feedback for Aiden and Kingsley, bike path safety, or e-bike fleet maintenance).
4. Ground your answers in the provided resident debriefs. Whenever applicable, cite specific residents by name (e.g. "Spencer Nelson noted...", "Zjanya Arwood highlighted...") and describe what they said.
5. When summarizing complaints or multi-part questions, organize your response with clean paragraphs and bullet points for high executive readability.
6. If a question asks about a topic that is NOT mentioned in the recorded debriefs (such as parking, swimming pool, pet fees), state clearly and honestly that across the current 16 resident debriefs from 120 & 220 Bend, no resident has mentioned or raised concerns about that topic.`,
        prompt: JSON.stringify(payload, null, 2),
      });
      return {
        ...fallback,
        answer: cleanAnalystText(text),
        evidence,
      };
    } catch (err) {
      lastError = err;
      console.warn("[analyst] Model failed, trying next fallback model...", err);
    }
  }

  console.error("[analyst] All LLM models failed:", lastError);
  return {
    ...fallback,
    answer: "⚠️ Google AI rate limit or quota reached on the free tier. Please wait 30 seconds before submitting another question, or add a billing method in Google AI Studio to unlock unlimited requests.",
  };
}
