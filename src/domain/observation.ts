import { z } from "zod";

/**
 * The leasing/tour observation subset. This is the proven MVP ontology kernel:
 * a host debrief becomes one structured Observation with extracted signals that
 * can be aggregated immediately.
 */

export const OBJECTION_TYPES = [
  "price",
  "fees",
  "parking",
  "location",
  "commute",
  "noise",
  "size_or_layout",
  "pet_policy",
  "amenities",
  "availability_or_timing",
  "application_or_process",
  "lease_terms",
  "safety",
  "other",
] as const;

export type ObjectionType = (typeof OBJECTION_TYPES)[number];

export const AMENITY_CATALOG = [
  "pool",
  "fitness_center",
  "dog_park",
  "parking_garage",
  "clubhouse",
  "coworking_space",
  "rooftop_deck",
  "package_room",
  "ev_charging",
  "playground",
  "trails",
  "retail_dining",
  "security",
  "spa",
  "grilling_area",
  "bike_storage",
  "concierge",
] as const;

const OBJECTION_LABELS: Record<string, string> = {
  size_or_layout: "Size / Layout",
  availability_or_timing: "Availability / Timing",
  application_or_process: "Application / Process",
  lease_terms: "Lease Terms",
  pet_policy: "Pet Policy",
};

const AMENITY_LABELS: Record<string, string> = {
  fitness_center: "Fitness Center",
  dog_park: "Dog Park",
  parking_garage: "Parking / Garage",
  coworking_space: "Coworking Space",
  rooftop_deck: "Rooftop Deck",
  package_room: "Package Room",
  ev_charging: "EV Charging",
  retail_dining: "Retail / Dining",
  grilling_area: "Grilling Area",
  bike_storage: "Bike Storage",
};

export function labelize(s: string): string {
  return s
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function objectionLabel(t: string): string {
  return OBJECTION_LABELS[t] ?? labelize(t);
}

export function amenityLabel(t: string): string {
  return AMENITY_LABELS[t] ?? labelize(t);
}

export const ExtractionSchema = z.object({
  summary: z
    .string()
    .describe("One or two neutral sentences recapping the tour and the prospect."),
  overallSentiment: z
    .number()
    .int()
    .min(-2)
    .max(2)
    .describe("Prospect sentiment: -2 very negative, 0 neutral, +2 very positive."),
  prospectIntent: z
    .enum(["hot", "warm", "cold", "unknown"])
    .describe("Likelihood to lease based on the signals in the debrief."),
  familyComposition: z
    .string()
    .nullable()
    .describe(
      'Household makeup if mentioned (e.g. "couple with a dog", "single professional", "family with 2 kids"), otherwise null.',
    ),
  lifestyleSignals: z
    .array(z.string())
    .describe("Lifestyle / preference signals: remote work, fitness, entertaining, pets, commuter, etc."),
  excitementMoments: z
    .array(z.string())
    .describe("Specific things that visibly excited or delighted the prospect."),
  hesitationMoments: z
    .array(z.string())
    .describe("Specific things that caused hesitation, concern, or cooling."),
  questionsAsked: z
    .array(z.string())
    .describe("Questions the prospect asked, normalized to a short canonical form."),
  objections: z
    .array(
      z.object({
        type: z.enum(OBJECTION_TYPES),
        detail: z.string().describe("Short, verbatim-grounded description of the objection."),
        severity: z.enum(["low", "medium", "high"]),
      }),
    )
    .describe("Concrete objections or blockers the prospect raised."),
  amenities: z
    .array(
      z.object({
        name: z
          .string()
          .describe("Amenity name in lowercase snake_case, from the catalog when possible."),
        reaction: z.enum(["positive", "negative", "neutral"]),
        detail: z.string(),
      }),
    )
    .describe("Amenities the prospect reacted to, positively or negatively."),
  followUpQuestions: z
    .array(z.string())
    .describe("1-4 questions the host should still answer to complete the picture (coverage gaps)."),
  coverageScore: z
    .number()
    .min(0)
    .max(1)
    .describe("0-1 estimate of how complete this debrief is."),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

export type ObservationEngine = "llm" | "heuristic";
export type ObservationSource = "live" | "demo";

export type Observation = {
  id: string;
  createdAt: string;
  source: ObservationSource;
  hostName?: string;
  floorPlan?: string;
  prospectTag?: string;
  transcript: string;
  engine: ObservationEngine;
  extraction: Extraction;
};
