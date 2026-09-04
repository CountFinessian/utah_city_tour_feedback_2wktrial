import { generateText, stepCountIs } from "ai";
import type { Observation } from "@/domain/observation";
import { GOOGLE_MODELS, getGoogleModel, hasGoogleKey, hasLLM, llmModel } from "@/server/ai/model-config";
import { buildEvidenceItem } from "@/domain/evidence-matcher";
import { sanitizeTranscript } from "@/domain/sanitize-text";
import { createRetrievalTools } from "./retrieval-tools";
import type { AnalystResponse } from "./analyst-service";

const AGENTIC_SYSTEM_PROMPT = `You are the executive intelligence analyst for Utah City leadership.
You answer strategic questions about captured resident tours and debriefs.

CRITICAL OPERATING RULES:
1. Dynamic Tool Usage: Never guess or hallucinate debrief data. Use your tools (searchDebriefs, getObservationDetails, queryAggregates, filterByResident) iteratively to gather exact facts before answering.
2. If asked how many people discussed a topic, call searchDebriefs and explicitly count the unique matching debriefs.
3. Clean Executive Voice: Write clean, decisive plain text. Never use markdown asterisks (no **bold** or *italic*), markdown headers (#), or bullet dashes. Use unicode bullets (• ) for lists.
4. Attribution: In your answer, cite resident names directly (e.g., "Seth Robertson noted...").
5. Citation Tag: At the very end of your final response, on a new line, append:
   CITED_OBSERVATIONS: [id1, id2]
   listing ONLY the observation IDs you actually cited in your answer.`;

function cleanText(text: string): string {
  return sanitizeTranscript(
    text
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^---+$/gm, "")
      .replace(/\*{3,}/g, "")
      .replace(/\*\*/g, "")
      .replace(/^\s*[\*\-]\s+/gm, "• ")
      .replace(/\n{3,}/g, "\n\n")
  ).trim();
}

export async function runAgenticRetrieval(
  question: string,
  observations: Observation[]
): Promise<AnalystResponse & { metrics: { latencyMs: number; tokenCount: number; mode: "agentic" } }> {
  const startTime = Date.now();
  const tools = createRetrievalTools(observations);

  const modelsToTry = hasGoogleKey()
    ? GOOGLE_MODELS.map((m) => getGoogleModel(m))
    : [llmModel()];

  let lastError: unknown = null;

  for (const model of modelsToTry) {
    try {
      const fetchPromise = generateText({
        model,
        system: AGENTIC_SYSTEM_PROMPT,
        tools,
        stopWhen: stepCountIs(4),
        prompt: question,
        temperature: 0.1,
      });

      const timeoutPromise = new Promise<{ text: string; usage?: { totalTokens?: number } }>((_, reject) =>
        setTimeout(() => reject(new Error("Agentic retrieval timeout")), 8000)
      );

      const res = await Promise.race([fetchPromise, timeoutPromise]);
      let text = res.text || "";
      const latencyMs = Date.now() - startTime;
      const tokenCount = res.usage?.totalTokens ?? 0;

      const citedMatch = text.match(/CITED_OBSERVATIONS:\s*\[(.*?)\]/i);
      let citedIds: string[] = [];
      if (citedMatch) {
        citedIds = citedMatch[1]
          .split(",")
          .map((s) => s.trim().replace(/['"]/g, ""))
          .filter(Boolean);
        text = text.replace(/CITED_OBSERVATIONS:\s*\[.*?\]/i, "").trim();
      }

      const matchedObs = observations.filter((o) => citedIds.includes(o.id));
      const evidence = matchedObs.map((obs) => buildEvidenceItem(obs, [question]));

      const cleanedAnswer = cleanText(text);

      return {
        answer: cleanedAnswer || "Analysis complete based on captured tour records.",
        confidence: observations.length < 5 ? "low" : observations.length < 15 ? "medium" : "high",
        sampleSize: observations.length,
        evidence,
        suggestedActions: [
          "Cross-reference with recent floor plan conversions",
          "Inspect objection trend in Command Center",
          "Flag for community management review",
        ],
        metrics: {
          latencyMs,
          tokenCount,
          mode: "agentic",
        },
      };
    } catch (err) {
      lastError = err;
      console.warn("[agentic-retriever] Model step failed, trying next fallback...", err instanceof Error ? err.message : err);
    }
  }

  throw lastError || new Error("All agentic retrieval attempts failed.");
}
