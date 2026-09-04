import { describe, it, expect, beforeAll } from "vitest";
import { answerAnalystQuestion } from "@/server/analyst/analyst-service";
import { sanitizeTranscript } from "@/domain/sanitize-text";
import { POST as seedPOST } from "@/app/api/seed/route";

describe("Analyst Service Response & Guidance", () => {
  beforeAll(async () => {
    await seedPOST();
  });

  it("handles 'hu' or short greetings with a warm welcome and usage instructions instead of boilerplate stats", async () => {
    const res = await answerAnalystQuestion("hu");
    expect(res.answer).toContain("Hello!");
    expect(res.answer).toContain("Senior Intelligence Analyst");
    expect(res.answer).toContain("Why are tours not converting?");
    expect(res.answer).not.toContain("Capture volume is sufficient");
    expect(res.evidence).toHaveLength(0);
    expect(res.suggestedActions.length).toBeGreaterThan(0);
  });

  it("handles 'hi' with guidance and zero evidence items", async () => {
    const res = await answerAnalystQuestion("hi");
    expect(res.answer).toContain("Hello!");
    expect(res.evidence).toHaveLength(0);
  });

  it("answers 'how many people talked about bikes?' with real quotes and precise evidence", async () => {
    const res = await answerAnalystQuestion("how many people talked about bikes?");
    expect(res.answer.toLowerCase()).toContain("bike");
    expect(res.answer.toLowerCase()).toContain("priya");
    expect(res.evidence.length).toBeGreaterThanOrEqual(1);
    expect(res.evidence.every((e) => e.excerpt.toLowerCase().includes("bike"))).toBe(true);
  });

  it("does not output markdown asterisks in answer", async () => {
    const res = await answerAnalystQuestion("parking");
    expect(res.answer).not.toMatch(/\*\*/);
    expect(res.answer).not.toMatch(/\*{3,}/);
  });

  it("sanitizes corrupted characters and strips raw Spanish translation artifacts", () => {
    const raw = "The communication, the benefits, the organization of the entire area. (Translated from Spanish: 'La comunicaci\uFFFDn, los beneficios, la organizaci\uFFFDn de todo el \uFFFDrea.')";
    const cleaned = sanitizeTranscript(raw);
    expect(cleaned).toBe("The communication, the benefits, the organization of the entire area.");
    expect(cleaned).not.toContain("Translated from Spanish");
    expect(cleaned).not.toContain("\uFFFD");

    const rawApostrophe = "All of the amenities, there\uFFFDs so much to do.";
    expect(sanitizeTranscript(rawApostrophe)).toBe("All of the amenities, there's so much to do.");
  });
});
