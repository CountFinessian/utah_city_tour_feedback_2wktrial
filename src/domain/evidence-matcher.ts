import type { Observation } from "./observation";
import type { EvidenceItem } from "@/components/domain/EvidencePopover";

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Checks whether haystack contains term as a distinct whole word or hyphenated token.
 * Prevents false-positive substring matches (e.g. "cycling" matching inside "recycling", "room" in "bathroom").
 */
export function matchesTerm(haystack: string, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (!t) return false;

  const escaped = t
    .split(/\s+/)
    .map(escapeRegex)
    .join("\\s+");

  // Exact word boundary: surrounded by non-alphanumerics or start/end of string
  const wordRegex = new RegExp(`(?:^|[^a-z0-9])${escaped}s?(?:[^a-z0-9]|$)`, "i");
  if (wordRegex.test(haystack)) return true;

  // Plural / singular stemming
  if (t.endsWith("s") && t.length > 3) {
    const singular = escapeRegex(t.slice(0, -1));
    const singularRegex = new RegExp(`(?:^|[^a-z0-9])${singular}(?:[^a-z0-9]|$)`, "i");
    if (singularRegex.test(haystack)) return true;
  }

  // Hyphenated forms (e.g. "ebike" <-> "e-bike")
  if (t.includes("-")) {
    const unhyphenated = escapeRegex(t.replace(/-/g, ""));
    const unhyphenatedRegex = new RegExp(`(?:^|[^a-z0-9])${unhyphenated}s?(?:[^a-z0-9]|$)`, "i");
    if (unhyphenatedRegex.test(haystack)) return true;
  } else if (t.startsWith("e") && t.length > 2) {
    const hyphenated = `e-${escapeRegex(t.slice(1))}`;
    const hyphenatedRegex = new RegExp(`(?:^|[^a-z0-9])${hyphenated}s?(?:[^a-z0-9]|$)`, "i");
    if (hyphenatedRegex.test(haystack)) return true;
  }

  return false;
}

/**
 * Extracts clean, complete sentence-level quotes matching search terms.
 * Returns complete sentences wrapped in quotation marks rather than chopped mid-sentence chunks.
 */
export function extractCleanExcerpt(transcript: string, terms: string[]): string {
  const text = transcript.trim();
  if (!text) return "Transcript evidence unavailable.";

  const normalizedTerms = terms.map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (normalizedTerms.length === 0) {
    const firstSentence = text.match(/[^.!?]+[.!?]+/)?.[0]?.trim() || text.slice(0, 140);
    return `"${firstSentence}"`;
  }

  // Split into complete sentences
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const matching = sentences
    .map((s) => s.trim())
    .filter((s) => normalizedTerms.some((term) => matchesTerm(s, term)));

  if (matching.length > 0) {
    const quote = matching.slice(0, 2).join(" ");
    return quote.startsWith('"') ? quote : `"${quote}"`;
  }

  // Word-boundary fallback
  const firstMatch = normalizedTerms.find((term) => matchesTerm(text, term));
  if (firstMatch) {
    const index = text.toLowerCase().indexOf(firstMatch);
    if (index >= 0) {
      const start = Math.max(0, text.lastIndexOf(" ", Math.max(0, index - 40)));
      const end = text.indexOf(" ", Math.min(text.length, index + 120));
      const slice = text.slice(start === 0 ? 0 : start + 1, end === -1 ? text.length : end).trim();
      return `"${slice}"`;
    }
  }

  const fallback = text.slice(0, 120).trim();
  return `"${fallback}..."`;
}

/**
 * Formats a clean attribution label for an observation.
 * Uses the resident name from prospectTag if available, else hostName.
 */
export function formatObservationMeta(obs: Observation): string {
  const cleanResident = (obs.prospectTag || "").replace(/\s*\([^)]*\)/, "").trim();
  const primaryName = cleanResident || obs.hostName || "Host";
  return [primaryName, obs.floorPlan, obs.source].filter(Boolean).join(" · ");
}

/**
 * Builds an EvidenceItem with clean attribution and sentence-level quote.
 */
export function buildEvidenceItem(obs: Observation, terms: string[]): EvidenceItem {
  return {
    id: obs.id,
    label: obs.extraction.summary || obs.prospectTag || "Observation",
    excerpt: extractCleanExcerpt(obs.transcript, terms),
    meta: formatObservationMeta(obs),
  };
}
