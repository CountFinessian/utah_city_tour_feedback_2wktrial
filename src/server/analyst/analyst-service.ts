import { generateText } from "ai";
import { z } from "zod";
import type { Observation } from "@/domain/observation";
import { GOOGLE_MODELS, getGoogleModel, hasGoogleKey, hasLLM, llmModel } from "@/server/ai/model-config";
import { listObservations } from "@/server/repositories/observations";
import { buildDigest, buildNarrativeGuardrail } from "@/server/reporting/digest";
import { getOrSetContextCache } from "@/server/ai/context-cache";
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
    .replace(/\*{3,}/g, "")
    .replace(/\*\*/g, "")
    .replace(/^\s*[\*\-]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const GREETING_WORDS = new Set([
  "hi", "hu", "hello", "hey", "hola", "yo", "sup", "howdy", "good", "morning", "afternoon", "evening", "there", "what", "tell", "about", "me", "the", "are", "you", "who", "can", "how", "please", "some", "with", "help", "test"
]);

function isGreetingOrUnclear(question: string, terms: string[]): boolean {
  const q = question.toLowerCase().trim();
  const greetings = [
    "hi", "hu", "hello", "hey", "hola", "yo", "sup", "howdy", "help",
    "who are you", "what can you do", "what do you do", "how does this work",
    "good morning", "good afternoon", "good evening", "greetings"
  ];
  if (greetings.includes(q) || q.length <= 3) return true;
  if (greetings.some((g) => q.startsWith(g) && q.length < g.length + 6)) return true;
  return terms.length === 0;
}

function excerptFor(transcript: string, terms: string[]): string {
  const text = transcript.trim();
  if (!text) return "Transcript evidence unavailable.";
  const normalized = text.toLowerCase();
  const tokens = terms
    .flatMap((term) => term.toLowerCase().split(/[^a-z0-9]+/))
    .filter((term) => term.length >= 4 && !GREETING_WORDS.has(term));
  const token = tokens.find((term) => normalized.includes(term));
  const index = token ? normalized.indexOf(token) : 0;
  const start = Math.max(0, index - 90);
  const end = Math.min(text.length, index + 220);
  return `${start > 0 ? "..." : ""}${text.slice(start, end)}${end < text.length ? "..." : ""}`;
}

function evidenceFor(observations: Observation[], terms: string[]): EvidenceItem[] {
  const normalizedTerms = terms
    .map((term) => term.toLowerCase().trim())
    .filter((t) => t.length >= 3 && !GREETING_WORDS.has(t));

  if (normalizedTerms.length === 0) return [];

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
      return normalizedTerms.some((term) => haystack.includes(term));
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
    .filter((term) => term.length >= 3 && !GREETING_WORDS.has(term))
    .slice(0, 12);
}

function heuristicAnswer(question: string, observations: Observation[]): AnalystResponse {
  const digest = buildDigest(observations);
  const guardrail = buildNarrativeGuardrail(digest, observations);
  const terms = keywordTerms(question);
  const q = question.toLowerCase();
  const evidence = evidenceFor(observations, terms);

  if (isGreetingOrUnclear(question, terms)) {
    return {
      answer:
        "Hello! I am Utah City's Senior Intelligence Analyst for 120 & 220 Bend.\n\n" +
        "I analyze resident tour debriefs, objections, and leasing signals. To get started, you can ask me questions like:\n" +
        "• Why are tours not converting?\n" +
        "• Which amenities do residents praise or complain about?\n" +
        "• Summarize objections regarding parking, noise, or pricing.",
      confidence: "high",
      sampleSize: observations.length,
      evidence: [],
      suggestedActions: [
        "Why are tours not converting?",
        "Which amenities matter most right now?",
        "Summarize objections about parking.",
      ],
    };
  }

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
    const topObj = digest.topObjections[0]?.label ?? "None";
    const topAmenity = digest.amenityRanking[0]?.label ?? "General amenities";
    answer =
      `Executive Operational Brief (${observations.length} debriefs across 120 & 220 Bend):\n` +
      `• Primary Objection Signal: ${topObj} (${digest.topObjections[0]?.count ?? 0} mentions)\n` +
      `• Top Amenity Driver: ${topAmenity} (${digest.amenityRanking[0]?.mentions ?? 0} mentions)\n` +
      `• Lead Pipeline: ${digest.intentFunnel.hot} hot leads identified with ${digest.avgSentiment ?? "positive"} average sentiment.\n\n` +
      `Ask a specific operational question (e.g., parking, amenities, or conversion barriers) for targeted resident quotes.`;
  }

  return {
    answer,
    confidence: guardrail.lowSample ? "low" : guardrail.label === "directional read" ? "medium" : "high",
    sampleSize: observations.length,
    evidence,
    suggestedActions: [
      "Why are tours not converting?",
      "Which amenities matter most right now?",
      "Summarize objections about parking.",
    ],
  };
}

type CachedResult = {
  fingerprint: string;
  response: AnalystResponse;
  timestamp: number;
};
const queryCache = new Map<string, CachedResult>();

export async function answerAnalystQuestion(question: string): Promise<AnalystResponse> {
  const observations = await listObservations();
  const fallback = heuristicAnswer(question, observations);
  if (!hasLLM() || observations.length === 0) return fallback;

  // 1. Check in-memory 0ms query cache
  const normalized = question.trim().toLowerCase();
  const fingerprint = `${observations.length}:${observations[0]?.createdAt ?? ""}`;
  const cached = queryCache.get(normalized);
  if (cached && cached.fingerprint === fingerprint && Date.now() - cached.timestamp < 15 * 60 * 1000) {
    return cached.response;
  }

  const digest = buildDigest(observations);
  const terms = keywordTerms(question);
  const evidence = evidenceFor(observations, terms);

  // 2. Obtain or create Google Gemini Context Cache (~90% cheaper token billing)
  const contextCacheName = await getOrSetContextCache(observations, digest);

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
      const fetchPromise = generateText({
        model,
        temperature: 0.1,
        maxRetries: 0,
        system: `You are Utah City's Senior Intelligence Analyst. You provide fast, direct, and concise executive analysis based on resident debriefs from 120 & 220 Bend.

Rules:
1. Be fast, direct, and concise. Keep responses under 130-160 words with quick, readable bullet points using '• '. Avoid filler or long essays.
2. DO NOT use markdown asterisks (**) anywhere. Do NOT wrap names or titles in asterisks. Write clean, natural plain text.
3. Cite resident names directly in plain text (e.g., Spencer Nelson flagged..., Zjanya Arwood noted...).
4. If the user sends a greeting, typo, or brief/unclear input (e.g., "hi", "hu", "hello", "hey", "help"), reply warmly in 2-3 short sentences: introduce yourself as Utah City's Senior Intelligence Analyst for 120 & 220 Bend, explain what you analyze, and give clear instructions on what to ask (e.g., asking why tours aren't converting, how residents feel about amenities, or recurring objections like parking). Do not dump raw metrics.
5. If a topic is not in the records (e.g., parking), state directly in 1-2 sentences that no residents have mentioned concerns about that topic across the 16 recorded debriefs.`,
        prompt: contextCacheName ? `Question: ${question}` : JSON.stringify(payload, null, 2),
        ...(contextCacheName
          ? {
              providerOptions: {
                google: {
                  cachedContent: contextCacheName,
                },
              },
            }
          : {}),
      });

      const timeoutPromise = new Promise<{ text: string }>((_, reject) =>
        setTimeout(() => reject(new Error("Model response timeout")), 6000)
      );

      const { text } = await Promise.race([fetchPromise, timeoutPromise]);
      const finalResponse: AnalystResponse = {
        ...fallback,
        answer: cleanAnalystText(text),
        evidence,
      };

      // Store in 0ms query cache
      queryCache.set(normalized, {
        fingerprint,
        response: finalResponse,
        timestamp: Date.now(),
      });

      return finalResponse;
    } catch (err) {
      lastError = err;
      console.warn("[analyst] Model failed or timed out, trying next fallback model...", err instanceof Error ? err.message : err);
    }
  }

  console.error("[analyst] All LLM models failed, serving grounded heuristic fallback:", lastError);
  return fallback;
}
