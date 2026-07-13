import { neon } from "@neondatabase/serverless";
import type { Extraction, Observation } from "@/domain/observation";
import type { ObservationRepository } from "./observation-repository";

export const PG_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  "";

function db() {
  if (!PG_URL) throw new Error("No Postgres connection string (DATABASE_URL / POSTGRES_URL).");
  return neon(PG_URL);
}

let schemaReady: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    const sql = db();
    schemaReady = (async () => {
      await sql`
        create table if not exists observations (
          id            text primary key,
          created_at    timestamptz not null default now(),
          host_name     text,
          floor_plan    text,
          prospect_tag  text,
          transcript    text not null,
          engine        text not null,
          extraction    jsonb not null
        )
      `;
      await sql`alter table observations add column if not exists source text not null default 'live'`;
      await sql`create index if not exists observations_created_at_idx on observations (created_at desc)`;
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

type Row = {
  id: string;
  created_at: string | Date;
  source: string | null;
  host_name: string | null;
  floor_plan: string | null;
  prospect_tag: string | null;
  transcript: string;
  engine: string;
  extraction: Extraction;
};

function toObservation(r: Row): Observation {
  return {
    id: r.id,
    createdAt: new Date(r.created_at).toISOString(),
    source: r.source === "demo" ? "demo" : "live",
    hostName: r.host_name ?? undefined,
    floorPlan: r.floor_plan ?? undefined,
    prospectTag: r.prospect_tag ?? undefined,
    transcript: r.transcript,
    engine: r.engine === "llm" ? "llm" : "heuristic",
    extraction: r.extraction,
  };
}

export const postgresObservationRepository: ObservationRepository = {
  async listObservations(): Promise<Observation[]> {
    await ensureSchema();
    const sql = db();
    const rows = (await sql`select * from observations order by created_at desc`) as Row[];
    return rows.map(toObservation);
  },

  async upsertObservation(obs: Observation): Promise<Observation> {
    await ensureSchema();
    const sql = db();
    await sql`
      insert into observations
        (id, created_at, source, host_name, floor_plan, prospect_tag, transcript, engine, extraction)
      values
        (${obs.id}, ${obs.createdAt}, ${obs.source}, ${obs.hostName ?? null}, ${obs.floorPlan ?? null},
         ${obs.prospectTag ?? null}, ${obs.transcript}, ${obs.engine}, ${JSON.stringify(obs.extraction)}::jsonb)
      on conflict (id) do update set
        source       = excluded.source,
        host_name    = excluded.host_name,
        floor_plan   = excluded.floor_plan,
        prospect_tag = excluded.prospect_tag,
        transcript   = excluded.transcript,
        engine       = excluded.engine,
        extraction   = excluded.extraction
    `;
    return obs;
  },

  async replaceAll(rows: Observation[]): Promise<void> {
    await ensureSchema();
    const sql = db();
    await sql`delete from observations`;
    for (const obs of rows) {
      await this.upsertObservation(obs);
    }
  },

  async clearAll(): Promise<void> {
    await ensureSchema();
    const sql = db();
    await sql`delete from observations`;
  },

  async clearDemo(): Promise<void> {
    await ensureSchema();
    const sql = db();
    await sql`delete from observations where source = 'demo'`;
  },
};

export const listObservations = postgresObservationRepository.listObservations.bind(postgresObservationRepository);
export const upsertObservation = postgresObservationRepository.upsertObservation.bind(postgresObservationRepository);
export const replaceAll = postgresObservationRepository.replaceAll.bind(postgresObservationRepository);
export const clearAll = postgresObservationRepository.clearAll.bind(postgresObservationRepository);
export const clearDemo = postgresObservationRepository.clearDemo.bind(postgresObservationRepository);
