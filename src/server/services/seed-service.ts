import type { Observation } from "@/domain/observation";
import {
  clearAll,
  clearDemo,
  listObservations,
  upsertObservation,
} from "@/server/repositories/observations";
import { makeSeed } from "@/lib/seed";

export function observationCounts(rows: Pick<Observation, "source">[]) {
  const demo = rows.filter((r) => r.source === "demo").length;
  return { total: rows.length, live: rows.length - demo, demo };
}

export async function loadDemoData() {
  await clearDemo();
  for (const obs of makeSeed()) {
    await upsertObservation(obs);
  }
  return observationCounts(await listObservations());
}

export async function clearSeedData(scope: "demo" | "all") {
  if (scope === "all") await clearAll();
  else await clearDemo();
  return observationCounts(await listObservations());
}
