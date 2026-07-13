import { promises as fs } from "fs";
import os from "os";
import path from "path";
import type { Observation } from "@/domain/observation";
import type { ObservationRepository } from "./observation-repository";

const DATA_DIR = process.env.DATA_DIR
  ? process.env.DATA_DIR
  : process.env.VERCEL
    ? path.join(os.tmpdir(), "utahcity-data")
    : path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "observations.json");

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function writeAll(rows: Observation[]): Promise<void> {
  await ensureDir();
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2), "utf8");
}

export const fileObservationRepository: ObservationRepository = {
  async listObservations(): Promise<Observation[]> {
    try {
      const raw = await fs.readFile(FILE, "utf8");
      const rows = JSON.parse(raw) as Observation[];
      return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch {
      return [];
    }
  },

  async upsertObservation(obs: Observation): Promise<Observation> {
    const rows = await this.listObservations();
    const idx = rows.findIndex((r) => r.id === obs.id);
    if (idx >= 0) rows[idx] = obs;
    else rows.push(obs);
    await writeAll(rows);
    return obs;
  },

  async replaceAll(rows: Observation[]): Promise<void> {
    await writeAll(rows);
  },

  async clearAll(): Promise<void> {
    await writeAll([]);
  },

  async clearDemo(): Promise<void> {
    const rows = await this.listObservations();
    await writeAll(rows.filter((r) => r.source !== "demo"));
  },
};

export const listObservations = fileObservationRepository.listObservations.bind(fileObservationRepository);
export const upsertObservation = fileObservationRepository.upsertObservation.bind(fileObservationRepository);
export const replaceAll = fileObservationRepository.replaceAll.bind(fileObservationRepository);
export const clearAll = fileObservationRepository.clearAll.bind(fileObservationRepository);
export const clearDemo = fileObservationRepository.clearDemo.bind(fileObservationRepository);
