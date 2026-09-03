import { amenityLabel, objectionLabel, type Observation } from "@/domain/observation";
import { buildCommandCenter } from "@/server/intelligence/command-center";
import { listObservations } from "@/server/repositories/observations";
import { buildDigest, buildNarrativeGuardrail, templateNarrative } from "@/server/reporting/digest";
import type { EvidenceItem } from "@/components/domain/EvidencePopover";

const DAY = 24 * 60 * 60 * 1000;

function excerptFor(transcript: string, candidates: string[]): string {
  const text = transcript.trim();
  if (!text) return "Transcript evidence unavailable.";
  const normalized = text.toLowerCase();
  const terms = candidates
    .flatMap((candidate) => candidate.toLowerCase().split(/[^a-z0-9]+/))
    .filter((term) => term.length >= 4);
  const match = terms.find((term) => normalized.includes(term));
  const index = match ? normalized.indexOf(match) : 0;
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + 190);
  return `${start > 0 ? "..." : ""}${text.slice(start, end)}${end < text.length ? "..." : ""}`;
}

function evidenceFrom(observations: Observation[], filter: (observation: Observation) => boolean, terms: string[]): EvidenceItem[] {
  return observations
    .filter(filter)
    .slice(0, 6)
    .map((observation) => ({
      id: observation.id,
      label: observation.extraction.summary || observation.prospectTag || "Captured observation",
      excerpt: excerptFor(observation.transcript, terms),
      meta: [observation.hostName, observation.floorPlan, observation.source].filter(Boolean).join(" · "),
    }));
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((sum, n) => sum + n, 0) / nums.length) * 100) / 100;
}

function sentimentTimeline(observations: Observation[]) {
  if (observations.length === 0) return [];

  const sorted = [...observations].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)
  );

  const byDate = new Map<string, { label: string; values: number[] }>();
  for (const o of sorted) {
    const d = new Date(o.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
    const cur = byDate.get(key) ?? { label, values: [] };
    cur.values.push(o.extraction.overallSentiment);
    byDate.set(key, cur);
  }

  return Array.from(byDate.values()).map((item) => ({
    label: item.label,
    sentiment: avg(item.values),
    count: item.values.length,
  }));
}

function freshness(observations: Observation[]): string {
  const latest = observations.reduce<string | null>(
    (max, observation) => (!max || observation.createdAt > max ? observation.createdAt : max),
    null,
  );
  if (!latest) return "No capture";
  const days = Math.floor((Date.now() - Date.parse(latest)) / DAY);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d old`;
}

export async function getCommandView() {
  const observations = await listObservations();
  const digest = buildDigest(observations);
  const commandCenter = buildCommandCenter(observations);
  const guardrail = buildNarrativeGuardrail(digest, observations);
  const narrative = templateNarrative(digest, observations);
  const liveCount = observations.filter((observation) => observation.source === "live").length;
  const demoCount = observations.length - liveCount;
  const avgCoverage = observations.length
    ? observations.reduce((sum, observation) => sum + observation.extraction.coverageScore, 0) / observations.length
    : 0;
  const intelligenceScore = Math.round(
    (commandCenter.dataConfidence.score * 0.38 + avgCoverage * 0.32 + Math.min(1, digest.last7 / 12) * 0.3) * 100,
  );

  const allEvidence = evidenceFrom(observations, () => true, []);
  const topObjection = digest.topObjections[0];
  const topAmenity = digest.amenityRanking[0];

  return {
    observations,
    digest,
    commandCenter,
    guardrail,
    narrative,
    liveCount,
    demoCount,
    avgCoverage,
    intelligenceScore,
    freshness: freshness(observations),
    metrics: [
      {
        label: "Intelligence Score",
        value: String(intelligenceScore),
        delta: digest.last7 - digest.prev7,
        confidence: commandCenter.dataConfidence.label,
        sampleSize: observations.length,
        evidence: allEvidence,
      },
      {
        label: "Evidence Confidence",
        value: `${Math.round(commandCenter.dataConfidence.score * 100)}%`,
        delta: liveCount - demoCount,
        confidence: commandCenter.dataConfidence.label,
        sampleSize: liveCount,
        evidence: allEvidence,
      },
      {
        label: "Net Sentiment",
        value: digest.avgSentiment?.toFixed(1) ?? "-",
        delta: digest.intentFunnel.hot - digest.intentFunnel.cold,
        confidence: guardrail.lowSample ? "low" : commandCenter.dataConfidence.label,
        sampleSize: observations.length,
        evidence: allEvidence,
      },
      {
        label: "Hot-lead Signal",
        value: String(digest.intentFunnel.hot),
        delta: digest.intentFunnel.hot - digest.intentFunnel.cold,
        confidence: guardrail.lowSample ? "low" : commandCenter.dataConfidence.label,
        sampleSize: observations.length,
        evidence: evidenceFrom(observations, (observation) => observation.extraction.prospectIntent === "hot", ["hot", "apply"]),
      },
    ] as const,
    deltas: [
      { label: "Tours captured", value: digest.last7 - digest.prev7, evidence: allEvidence },
      {
        label: topObjection ? `${topObjection.label} mentions` : "Objection volume",
        value: topObjection?.count ?? 0,
        evidence: topObjection
          ? evidenceFrom(
              observations,
              (observation) => observation.extraction.objections.some((objection) => objection.type === topObjection.type),
              [topObjection.label, topObjection.example],
            )
          : [],
      },
      {
        label: topAmenity ? `${topAmenity.label} net interest` : "Amenity interest",
        value: topAmenity?.net ?? 0,
        evidence: topAmenity
          ? evidenceFrom(
              observations,
              (observation) => observation.extraction.amenities.some((amenity) => amenity.name === topAmenity.name),
              [topAmenity.label],
            )
          : [],
      },
    ],
    sentimentTimeline: sentimentTimeline(observations),
    intentFunnel: [
      { intent: "Hot", count: digest.intentFunnel.hot },
      { intent: "Warm", count: digest.intentFunnel.warm },
      { intent: "Cold", count: digest.intentFunnel.cold },
      { intent: "Unknown", count: digest.intentFunnel.unknown },
    ],
    objectionRows: digest.topObjections.slice(0, 8).map((objection) => ({
      ...objection,
      evidence: evidenceFrom(
        observations,
        (observation) => observation.extraction.objections.some((item) => item.type === objection.type),
        [objection.label, objection.example],
      ),
    })),
    amenityRows: digest.amenityRanking.slice(0, 8).map((amenity) => ({
      ...amenity,
      evidence: evidenceFrom(
        observations,
        (observation) => observation.extraction.amenities.some((item) => item.name === amenity.name),
        [amenityLabel(amenity.name), amenity.name],
      ),
    })),
    recommendationRows: commandCenter.recommendedActions.map((action, index) => ({
      ...action,
      evidenceItems: evidenceFrom(observations, () => true, action.evidence.length ? action.evidence : [action.title]).slice(0, 3),
      id: `${index}-${action.title}`,
    })),
    signalSummary: {
      topObjectionLabel: topObjection ? objectionLabel(topObjection.type) : "None yet",
      topAmenityLabel: topAmenity ? amenityLabel(topAmenity.name) : "None yet",
    },
  };
}
