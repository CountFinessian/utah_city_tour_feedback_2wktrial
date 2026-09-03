import { generateText } from "ai";
import { amenityLabel, objectionLabel, type Observation } from "@/domain/observation";
import { hasLLM, llmModel } from "@/server/ai/model-config";

export type ObjectionAgg = {
  type: string;
  label: string;
  count: number;
  highSeverity: number;
  example: string;
};

export type AmenityAgg = {
  name: string;
  label: string;
  mentions: number;
  positive: number;
  negative: number;
  neutral: number;
  net: number;
};

export type QuestionAgg = { question: string; count: number };

export type RecentItem = {
  id: string;
  createdAt: string;
  source: "live" | "demo";
  summary: string;
  intent: string;
  sentiment: number;
  hostName?: string;
  floorPlan?: string;
};

export type Digest = {
  totalTours: number;
  last7: number;
  prev7: number;
  avgSentiment: number | null;
  sentimentDist: Record<string, number>;
  intentFunnel: { hot: number; warm: number; cold: number; unknown: number };
  topObjections: ObjectionAgg[];
  amenityRanking: AmenityAgg[];
  topQuestions: QuestionAgg[];
  excitementSamples: string[];
  hesitationSamples: string[];
  recent: RecentItem[];
};

const DAY = 24 * 60 * 60 * 1000;

export type NarrativeGuardrail = {
  liveCount: number;
  lowSample: boolean;
  label: "early signal" | "directional read" | "operating trend";
  recommendationPrefix: "Draft recommendation" | "Recommended action";
  confidenceLanguage: string;
};

function normalizeQuestion(q: string): string {
  return q.trim().toLowerCase().replace(/[?.!]+$/g, "").replace(/\s+/g, " ");
}

export function buildDigest(observations: Observation[]): Digest {
  const now = Date.now();
  const last7 = observations.filter((o) => now - Date.parse(o.createdAt) < 7 * DAY).length;
  const prev7 = observations.filter((o) => {
    const age = now - Date.parse(o.createdAt);
    return age >= 7 * DAY && age < 14 * DAY;
  }).length;

  const sentiments = observations.map((o) => o.extraction.overallSentiment);
  const avgSentiment =
    sentiments.length > 0
      ? Math.round((sentiments.reduce((a, b) => a + b, 0) / sentiments.length) * 100) / 100
      : null;
  const sentimentDist: Record<string, number> = { "-2": 0, "-1": 0, "0": 0, "1": 0, "2": 0 };
  for (const s of sentiments) sentimentDist[String(s)] = (sentimentDist[String(s)] ?? 0) + 1;

  const intentFunnel = { hot: 0, warm: 0, cold: 0, unknown: 0 };
  for (const o of observations) {
    const raw = String(o.extraction.prospectIntent || "").toLowerCase();
    if (raw === "hot" || raw === "signed") intentFunnel.hot += 1;
    else if (raw === "warm" || raw === "hesitant") intentFunnel.warm += 1;
    else if (raw === "cold") intentFunnel.cold += 1;
    else intentFunnel.unknown += 1;
  }

  const objMap = new Map<string, ObjectionAgg>();
  for (const o of observations) {
    for (const obj of o.extraction.objections) {
      const cur =
        objMap.get(obj.type) ??
        { type: obj.type, label: objectionLabel(obj.type), count: 0, highSeverity: 0, example: obj.detail };
      cur.count += 1;
      if (obj.severity === "high") cur.highSeverity += 1;
      if (!cur.example) cur.example = obj.detail;
      objMap.set(obj.type, cur);
    }
  }
  const topObjections = [...objMap.values()].sort((a, b) => b.count - a.count);

  const amMap = new Map<string, AmenityAgg>();
  for (const o of observations) {
    for (const a of o.extraction.amenities) {
      const cur =
        amMap.get(a.name) ??
        { name: a.name, label: amenityLabel(a.name), mentions: 0, positive: 0, negative: 0, neutral: 0, net: 0 };
      cur.mentions += 1;
      cur[a.reaction] += 1;
      amMap.set(a.name, cur);
    }
  }
  const amenityRanking = [...amMap.values()]
    .map((a) => ({ ...a, net: a.positive - a.negative }))
    .sort((a, b) => b.mentions - a.mentions || b.net - a.net);

  const qMap = new Map<string, QuestionAgg>();
  for (const o of observations) {
    for (const q of o.extraction.questionsAsked) {
      const key = normalizeQuestion(q);
      if (!key) continue;
      const cur = qMap.get(key) ?? { question: q.trim(), count: 0 };
      cur.count += 1;
      qMap.set(key, cur);
    }
  }
  const topQuestions = [...qMap.values()].sort((a, b) => b.count - a.count).slice(0, 8);

  const excitementSamples = observations
    .flatMap((o) => o.extraction.excitementMoments)
    .slice(0, 6);
  const hesitationSamples = observations
    .flatMap((o) => o.extraction.hesitationMoments)
    .slice(0, 6);

  const recent: RecentItem[] = observations.slice(0, 12).map((o) => ({
    id: o.id,
    createdAt: o.createdAt,
    source: o.source === "demo" ? "demo" : "live",
    summary: o.extraction.summary,
    intent: o.extraction.prospectIntent,
    sentiment: o.extraction.overallSentiment,
    hostName: o.hostName,
    floorPlan: o.floorPlan,
  }));

  return {
    totalTours: observations.length,
    last7,
    prev7,
    avgSentiment,
    sentimentDist,
    intentFunnel,
    topObjections,
    amenityRanking,
    topQuestions,
    excitementSamples,
    hesitationSamples,
    recent,
  };
}

export function buildNarrativeGuardrail(d: Digest, observations: Observation[]): NarrativeGuardrail {
  const liveCount = observations.filter((o) => o.source === "live").length;
  const lowSample = d.totalTours < 5 || liveCount < 5;
  if (lowSample) {
    return {
      liveCount,
      lowSample,
      label: "early signal",
      recommendationPrefix: "Draft recommendation",
      confidenceLanguage: "Treat this as an early read until capture volume increases.",
    };
  }
  if (d.totalTours < 15 || liveCount < 15) {
    return {
      liveCount,
      lowSample: false,
      label: "directional read",
      recommendationPrefix: "Recommended action",
      confidenceLanguage: "This is directionally useful, with trend confidence still building.",
    };
  }
  return {
    liveCount,
    lowSample: false,
    label: "operating trend",
    recommendationPrefix: "Recommended action",
    confidenceLanguage: "Capture volume is sufficient for an operating trend read.",
  };
}

function templateNarrative(d: Digest, observations: Observation[] = []): string {
  if (d.totalTours === 0) {
    return "No tour debriefs have been logged yet. Once hosts start debriefing after tours, this brief will summarize what prospects are reacting to, the objections that are trending, and which amenities are driving interest.";
  }
  const guardrail = buildNarrativeGuardrail(d, observations);
  const topObj = d.topObjections[0];
  const topAm = d.amenityRanking[0];
  const trend =
    d.prev7 > 0 ? (d.last7 >= d.prev7 ? "up or flat vs. the prior week" : "down vs. the prior week") : "in its first week of capture";
  const parts: string[] = [];
  if (guardrail.lowSample) {
    parts.push(
      `Early signal only: ${d.totalTours} tour debrief${d.totalTours === 1 ? "" : "s"} ${d.last7 > 0 ? `(${d.last7} in the last 7 days)` : ""} ${trend}. Average prospect sentiment is ${d.avgSentiment ?? 0} on a -2 to +2 scale, but leadership should not treat this as a settled trend yet.`,
    );
  } else {
    parts.push(
      `Hosts logged ${d.totalTours} tour debrief${d.totalTours === 1 ? "" : "s"} (${d.last7} in the last 7 days, ${trend}). Average prospect sentiment is ${d.avgSentiment ?? 0} on a -2 to +2 scale.`,
    );
  }
  if (topObj) {
    parts.push(
      `${guardrail.lowSample ? "In this small sample, " : ""}${topObj.label} is the leading objection (${topObj.count} mention${topObj.count === 1 ? "" : "s"}${topObj.highSeverity ? `, ${topObj.highSeverity} high-severity` : ""}). Example: "${topObj.example}".`,
    );
  }
  if (topAm) {
    parts.push(
      `${topAm.label} is the most-discussed amenity in the current corpus (${topAm.mentions} mention${topAm.mentions === 1 ? "" : "s"}, net ${topAm.net >= 0 ? "+" : ""}${topAm.net} sentiment).`,
    );
  }
  parts.push(
    `Pipeline read: ${d.intentFunnel.hot} hot, ${d.intentFunnel.warm} warm, ${d.intentFunnel.cold} cold.`,
  );
  if (topObj) {
    parts.push(`${guardrail.recommendationPrefix}: pressure-test messaging around ${topObj.label.toLowerCase()} and collect more evidence before making a broad operating change.`);
  }
  return parts.join(" ");
}

export async function generateNarrative(d: Digest, observations: Observation[]): Promise<string> {
  if (d.totalTours === 0) return templateNarrative(d, observations);
  const guardrail = buildNarrativeGuardrail(d, observations);
  if (guardrail.lowSample) return templateNarrative(d, observations);
  if (!hasLLM()) return templateNarrative(d, observations);

  const compact = {
    totalTours: d.totalTours,
    last7: d.last7,
    prev7: d.prev7,
    avgSentiment: d.avgSentiment,
    intentFunnel: d.intentFunnel,
    topObjections: d.topObjections.slice(0, 5).map((o) => ({ objection: o.label, count: o.count, highSeverity: o.highSeverity, example: o.example })),
    amenities: d.amenityRanking.slice(0, 6).map((a) => ({ amenity: a.label, mentions: a.mentions, net: a.net })),
    recurringQuestions: d.topQuestions.slice(0, 5).map((q) => ({ q: q.question, count: q.count })),
  };

  try {
    const { text } = await generateText({
      model: llmModel(),
      system:
        "You write the weekly 'What Hosts Are Hearing' brief for Utah City leadership. Be concise, concrete, and grounded ONLY in the supplied aggregates; never invent numbers. 120-180 words. Use confidence-aware language. Do not call a pattern a trend unless the supplied guardrail says operating trend. Lead with what changed, then top objection and top amenity, then a one-line recommended action. No bullet points, no preamble.",
      prompt: `Guardrail: ${JSON.stringify(guardrail)}\nAggregated host-debrief data for this period:\n${JSON.stringify(compact, null, 2)}`,
    });
    return text.trim().replace(/\*\*/g, "");
  } catch (err) {
    console.error("[digest] narrative generation failed, using template:", err);
    return templateNarrative(d, observations);
  }
}
