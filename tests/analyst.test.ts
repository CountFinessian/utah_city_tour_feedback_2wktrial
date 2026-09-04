import { describe, it, expect, beforeAll } from "vitest";
import { answerAnalystQuestion } from "@/server/analyst/analyst-service";
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

  it("does not output markdown asterisks in answer", async () => {
    const res = await answerAnalystQuestion("parking");
    expect(res.answer).not.toMatch(/\*\*/);
    expect(res.answer).not.toMatch(/\*{3,}/);
  });
});

