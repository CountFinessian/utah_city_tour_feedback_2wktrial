# Utah City — Host Intelligence (MVP)

The thinnest slice of the Utah City **operational memory** system: capture what hosts
hear on every tour, structure it automatically, and roll it up into a leadership
"What Hosts Are Hearing" digest.

This is the Host-touchpoint MVP from the strategy plan — one touchpoint, one persona,
one decision-maker consuming the output. It deliberately excludes other touchpoints,
prediction, and dashboards until the capture habit is real.

## The loop

```
host talks (or types)  ─►  transcript  ─►  LLM extraction into a minimal ontology
        ▲                                          │
        │                                          ▼
   weekly digest  ◄──  aggregation  ◄──  stored Observation (objections, amenity
   for leadership                          reactions, intent, sentiment, follow-ups)
```

- **Capture** (`/`) — mobile-first. Tap the mic and talk (transcribed **on-device** with
  Whisper via transformers.js — no API key, fully private), or type. The system extracts
  objections (controlled vocabulary), amenity reactions, prospect intent, sentiment,
  family/lifestyle signals, questions asked, and the follow-ups that would complete the
  picture — then suggests refinements (the "ambient coverage" idea).
- **Manager** (`/manager`) — adoption view. Per-host coverage vs. a weekly target, a
  7-day activity sparkline, last-logged streaks, and who needs a nudge. Adoption is the
  make-or-break metric: no debriefs, no intelligence.
- **Digest** (`/digest`) — leadership view. Top objections (note how *parking* recurs in
  the demo data), amenity interest, pipeline read, recurring questions, and an
  auto-written weekly brief.

## Run it

```bash
npm run dev
# open http://localhost:3000  → click "Load demo data" on the Digest page
```

It works **with no API keys and no database**: extraction falls back to a deterministic
heuristic, the digest brief uses a grounded template, and data persists to a local JSON
file. To upgrade, copy `.env.example` to `.env.local`:

- `DATABASE_URL` → durable Postgres (Neon) instead of the JSON file. The Vercel Neon
  Marketplace integration sets this automatically on deploy.
- `AI_GATEWAY_API_KEY` → Claude-quality extraction + an LLM-written narrative (via the
  Vercel AI Gateway; models are swappable with `EXTRACTION_MODEL` / `NARRATIVE_MODEL`).
  On Vercel this works automatically via OIDC — no key needed.
- Voice is transcribed **on-device** by default (transformers.js Whisper, `whisper-base.en`,
  ~80 MB downloaded once per browser — no key, no server). `NEXT_PUBLIC_WHISPER_MODEL` swaps the
  model; `OPENAI_API_KEY` optionally switches to faster server-side Whisper instead.

Check wiring at `/api/status` (reports storage backend, extraction engine, model).

## Architecture

| Concern | Where | Note |
|---|---|---|
| Ontology (zod schema + controlled vocabularies) | `src/lib/ontology.ts` | The minimal Observation/Signal model |
| Extraction (LLM + offline fallback) | `src/lib/extract.ts` | `generateObject` with a heuristic backup |
| Storage | `src/lib/store.ts` | File-based JSON (`.data/`) — swap for Postgres + a vector store in production |
| Aggregation + narrative | `src/lib/digest.ts` | Deterministic rollups; LLM prose when available |
| API | `src/app/api/*` | `observations`, `transcribe`, `digest`, `seed` |
| UI | `src/app/`, `src/components/` | Next.js App Router, Tailwind v4 |

Built with Next.js 16, React 19, the Vercel AI SDK v6, and Tailwind CSS v4.

## Tests

```bash
npm test              # Vitest: unit + API-route integration (38 tests)
npm run test:e2e      # Playwright: real-browser capture → digest flow (4 tests)
npm run test:e2e:voice # Playwright: fake-mic WAV → on-device Whisper → transcript (1 test)
```

- **Unit/integration** (`tests/`): heuristic extraction (incl. the word-boundary regression
  that stopped "spa" matching "space"), digest aggregation, adoption/coverage, the file-store
  roundtrip, ontology validation, the `/api/*` route handlers, and `transcribeAudio`
  (unavailable, success, provider-error, and network-failure paths via a mocked provider).
- **E2E** (`e2e/`): boots an isolated, offline app and drives Chromium through typing a
  debrief → "Structure" → asserting the extracted signals, plus the manager and digest pages.
  The mic itself can't be driven headlessly, but the transcription *logic* is unit-tested and
  every downstream step is covered.

> **Production swaps (flagged, not built):** the JSON file store isn't durable on
> serverless filesystems — move to Postgres + a vector index (the Section 7 dual-store).
> And before any segmentation/prediction feature, clear the fair-housing and
> recording-consent review noted in the strategy doc's risk register.
