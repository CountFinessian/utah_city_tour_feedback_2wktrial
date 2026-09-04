import { tool } from "ai";
import { z } from "zod";
import type { Observation } from "@/domain/observation";
import { matchesTerm, extractCleanExcerpt } from "@/domain/evidence-matcher";
import { buildDigest } from "@/server/reporting/digest";

export function createRetrievalTools(observations: Observation[]) {
  return {
    searchDebriefs: tool({
      description:
        "Search captured resident debriefs using whole keywords or phrases (e.g., 'bike', 'parking', 'dog', 'gym', 'recycling'). Returns matching observations with relevant sentence excerpts.",
      inputSchema: z.object({
        query: z.string().describe("The topic, amenity, objection, or keyword to search for"),
      }),
      execute: async ({ query }) => {
        const terms = query
          .toLowerCase()
          .split(/[^a-z0-9\-]+/)
          .map((t) => t.trim())
          .filter((t) => t.length >= 3);

        if (terms.length === 0) {
          return { totalMatches: 0, results: [] };
        }

        const matches = observations.filter((obs) => {
          const haystack = [
            obs.prospectTag,
            obs.hostName,
            obs.floorPlan,
            obs.transcript,
            obs.extraction.summary,
            ...obs.extraction.questionsAsked,
            ...obs.extraction.objections.map((o) => `${o.type} ${o.detail}`),
            ...obs.extraction.amenities.map((a) => `${a.name} ${a.detail}`),
          ]
            .join(" ")
            .toLowerCase();

          return terms.some((term) => matchesTerm(haystack, term));
        });

        return {
          totalMatches: matches.length,
          results: matches.slice(0, 8).map((obs) => ({
            id: obs.id,
            resident: (obs.prospectTag || "").replace(/\s*\([^)]*\)/, "").trim() || obs.hostName,
            floorPlan: obs.floorPlan,
            summary: obs.extraction.summary,
            excerpt: extractCleanExcerpt(obs.transcript, terms),
          })),
        };
      },
    }),

    getObservationDetails: tool({
      description:
        "Fetch the complete verbatim transcript and deep signal breakdown for specific observation IDs when in-depth quotes or full context is needed.",
      inputSchema: z.object({
        ids: z.array(z.string()).describe("List of observation IDs to inspect"),
      }),
      execute: async ({ ids }) => {
        const selected = observations.filter((obs) => ids.includes(obs.id));
        return {
          count: selected.length,
          observations: selected.map((obs) => ({
            id: obs.id,
            resident: (obs.prospectTag || "").replace(/\s*\([^)]*\)/, "").trim() || obs.hostName,
            floorPlan: obs.floorPlan,
            source: obs.source,
            summary: obs.extraction.summary,
            verbatimTranscript: obs.transcript,
            objections: obs.extraction.objections,
            amenities: obs.extraction.amenities,
            sentimentScore: obs.extraction.overallSentiment,
          })),
        };
      },
    }),

    queryAggregates: tool({
      description:
        "Retrieve high-level statistical summaries across all captured tours (total tour count, average sentiment, top objections, amenity rankings).",
      inputSchema: z.object({
        dimension: z
          .enum(["all", "sentiment", "objections", "amenities"])
          .default("all")
          .describe("The aggregate metric dimension to inspect"),
      }),
      execute: async ({ dimension }) => {
        const digest = buildDigest(observations);
        if (dimension === "sentiment") {
          return { totalTours: digest.totalTours, avgSentiment: digest.avgSentiment };
        }
        if (dimension === "objections") {
          return { topObjections: digest.topObjections };
        }
        if (dimension === "amenities") {
          return { amenityRanking: digest.amenityRanking };
        }
        return {
          totalTours: digest.totalTours,
          avgSentiment: digest.avgSentiment,
          topObjections: digest.topObjections.slice(0, 5),
          amenityRanking: digest.amenityRanking.slice(0, 5),
        };
      },
    }),

    filterByResident: tool({
      description:
        "Find tours associated with a specific resident name, prospect tag, or tour host.",
      inputSchema: z.object({
        name: z.string().describe("Resident prospect name, email, or tour host"),
      }),
      execute: async ({ name }) => {
        const queryLower = name.toLowerCase().trim();
        const matches = observations.filter((obs) => {
          const tag = (obs.prospectTag || "").toLowerCase();
          const host = (obs.hostName || "").toLowerCase();
          return tag.includes(queryLower) || host.includes(queryLower);
        });

        return {
          matches: matches.map((obs) => ({
            id: obs.id,
            resident: (obs.prospectTag || "").replace(/\s*\([^)]*\)/, "").trim() || obs.hostName,
            floorPlan: obs.floorPlan,
            summary: obs.extraction.summary,
            transcript: obs.transcript,
          })),
        };
      },
    }),
  };
}
