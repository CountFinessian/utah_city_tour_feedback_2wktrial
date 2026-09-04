import { generateText, stepCountIs } from "ai";
import type { Observation } from "@/domain/observation";
import { GOOGLE_MODELS, getGoogleModel, hasGoogleKey, hasLLM, llmModel } from "@/server/ai/model-config";
import { buildEvidenceItem } from "@/domain/evidence-matcher";
import { sanitizeTranscript } from "@/domain/sanitize-text";
import { createRetrievalTools } from "./retrieval-tools";
import type { AnalystResponse } from "./analyst-service";

const AGENTIC_SYSTEM_PROMPT = `You are the executive intelligence analyst for Utah City leadership.
You answer strategic questions about captured resident tours and debriefs.

OPERATING WORKFLOW:
1. Retrieval Step: When asked a question, call searchDebriefs, filterByResident, or queryAggregates ONCE to find matching debriefs.
2. Immediate Answer: Once you have gathered the tool results, STOP calling tools and IMMEDIATELY write your final executive answer summarizing the findings. Do not make redundant tool calls.
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
        stopWhen: stepCountIs(5),
        prompt: question,
        temperature: 0.1,
      });

      const timeoutPromise = new Promise<{ text: string; usage?: { totalTokens?: number }; steps?: any[] }>((_, reject) =>
        setTimeout(() => reject(new Error("Agentic retrieval timeout")), 12000)
      );

      const res = await Promise.race([fetchPromise, timeoutPromise]);
      let text = res.text || "";
      const latencyMs = Date.now() - startTime;
      const tokenCount = res.usage?.totalTokens ?? 0;

      let citedIds: string[] = [];
      const citedMatch = text.match(/CITED_OBSERVATIONS:\s*\[(.*?)\]/i);
      if (citedMatch) {
        citedIds = citedMatch[1]
          .split(",")
          .map((s) => s.trim().replace(/['"]/g, ""))
          .filter(Boolean);
        text = text.replace(/CITED_OBSERVATIONS:\s*\[.*?\]/i, "").trim();
      }

      // Fallback: If text was not generated in the final step, extract answer from tool results
      if (!text.trim() && res.steps) {
        const foundHits: Array<{ id: string; resident?: string; excerpt: string }> = [];
        for (const step of res.steps) {
          for (const tr of step.toolResults || []) {
            if (tr.output && typeof tr.output === "object") {
              const out = tr.output as Record<string, any>;
              if (Array.isArray(out.results)) foundHits.push(...out.results);
              if (Array.isArray(out.matches)) foundHits.push(...out.matches);
            }
          }
        }
        if (foundHits.length > 0) {
          const unique = Array.from(new Map(foundHits.map((h) => [h.id, h])).values());
          text = `Based on captured resident debriefs, ${unique.length} observation${unique.length === 1 ? "" : "s"} discussed this topic:\n\n` +
            unique.map((h) => `• ${h.resident}: ${h.excerpt}`).join("\n");
          citedIds = unique.map((h) => h.id);
        }
      }

      const matchedObs = observations.filter((o) => citedIds.includes(o.id));
      let evidence = matchedObs.map((obs) => buildEvidenceItem(obs, [question]));

      const cleanedAnswer = cleanText(text);
      const answerLower = cleanedAnswer.toLowerCase();
      if (
        answerLower.includes("insufficient evidence") ||
        answerLower.includes("no direct resident observations") ||
        answerLower.includes("no observations found") ||
        answerLower.includes("none of the debriefs") ||
        answerLower.includes("no relevant debrief")
      ) {
        evidence = [];
      }

      return {
        answer: cleanedAnswer || "No direct resident observations found matching this query.",
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
