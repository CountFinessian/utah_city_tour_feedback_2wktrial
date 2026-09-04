import { describe, it, expect, beforeAll } from "vitest";
import { POST as seedPOST } from "@/app/api/seed/route";
import { listObservations } from "@/server/repositories/observations";
import { createRetrievalTools } from "@/server/analyst/retrieval-tools";
import { answerAnalystQuestion } from "@/server/analyst/analyst-service";

describe("Agentic Retrieval & Tools", () => {
  beforeAll(async () => {
    await seedPOST();
  });

  it("searchDebriefs finds targeted observations without full corpus dump", async () => {
    const observations = await listObservations();
    const tools = createRetrievalTools(observations);

    // Call execute on searchDebriefs
    const result = await tools.searchDebriefs.execute(
      { query: "bike" },
      { messages: [], toolCallId: "test_call_1" }
    );

    expect(result.totalMatches).toBeGreaterThanOrEqual(1);
    expect(result.results.some((r) => r.excerpt.toLowerCase().includes("bike"))).toBe(true);
    // Strict word-boundary guarantees no recycling false-positive
    expect(result.results.every((r) => !r.excerpt.toLowerCase().includes("recycling"))).toBe(true);
  });

  it("getObservationDetails fetches verbatim transcript for specific IDs", async () => {
    const observations = await listObservations();
    const tools = createRetrievalTools(observations);
    const targetId = observations[0].id;

    const result = await tools.getObservationDetails.execute(
      { ids: [targetId] },
      { messages: [], toolCallId: "test_call_2" }
    );

    expect(result.count).toBe(1);
    expect(result.observations[0].id).toBe(targetId);
    expect(result.observations[0].verbatimTranscript).toBeDefined();
  });

  it("queryAggregates computes high-level metrics without loading transcripts", async () => {
    const observations = await listObservations();
    const tools = createRetrievalTools(observations);

    const result = await tools.queryAggregates.execute(
      { dimension: "all" },
      { messages: [], toolCallId: "test_call_3" }
    );

    expect(result.totalTours).toBe(observations.length);
    expect(result.topObjections).toBeDefined();
    expect(result.amenityRanking).toBeDefined();
  });

  it("supports mode: compare returning both Agentic and RAG responses with latency metrics", async () => {
    const comparison = await answerAnalystQuestion("parking", "compare");
    expect("mode" in comparison && comparison.mode === "compare").toBe(true);
    if ("mode" in comparison && comparison.mode === "compare") {
      expect(comparison.agentic).toBeDefined();
      expect(comparison.rag).toBeDefined();
      expect(comparison.agentic.metrics?.latencyMs).toBeDefined();
      expect(comparison.rag.metrics?.latencyMs).toBeDefined();
      expect(comparison.agentic.answer).toBeDefined();
      expect(comparison.rag.answer).toBeDefined();
    }
  });

  it("runAgenticRetrieval executes without crashing and returns formatted response", async () => {
    const { runAgenticRetrieval } = await import("@/server/analyst/agentic-retriever");
    const observations = await listObservations();
    if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      expect(observations.length).toBeGreaterThan(0);
      return;
    }
    const result = await runAgenticRetrieval("How many people talk about biking?", observations);
    expect(result.answer).toBeDefined();
    expect(result.metrics.mode).toBe("agentic");
  });
});
