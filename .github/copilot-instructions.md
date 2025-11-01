
<!-- Copilot instructions: concise, actionable, repo-specific -->

# interview-ai — quick guide for coding agents

Quick context: frontend is a Next.js (App Router) TypeScript app. The canonical analysis/summarization engine is the Python LiveKit agent in `backend/` — prefer interacting with the agent and the in-room data channels over re-implementing server-side LLM endpoints.

Core contracts (most important to preserve)
- GET /api/livekit/token — `src/app/api/livekit/token/route.ts` → { token, interviewId }
  - Generates a LiveKit AccessToken and attempts to create an `interviews` row. It may use the Supabase service role or fall back to direct DB/upsert.
- POST /api/interviews/audio/upload — `src/app/api/interviews/audio/upload/route.ts` (multipart form: `interviewId` + `file`). Requires `Authorization: Bearer <supabase-token>` and writes `audio_path`/`audio_signed_url` to the interview row.

Realtime/data-channel conventions
- Agent publishes room-level messages across a few topics used by the frontend:
  - `agent-messages` / `interview_results` — higher-level summaries, analysis blobs.
  - `live-metrics` — numeric realtime metrics (agent publishes JSON like { type: 'live_metrics', confidence_score: <0-100>, professionalism_score: <0-100>, filler_count: <int>, ai_feedback?: string, question_number?: number }). Frontend maps 0–100 → 0–10 for display.

Data shapes & DB conventions
- `interviews` table (`src/db/schema.ts`): `transcript` and `analysis` are stored as TEXT containing serialized JSON strings. Code expects to call `JSON.parse(row.transcript)` when reading.

Where to look first (fast path)
- Token + interview creation: `src/app/api/livekit/token/route.ts`
- Audio uploads: `src/app/api/interviews/audio/upload/route.ts`
- Interview UI / live metrics wiring: `src/app/interview/page.tsx` (front-end subscribes to `live-metrics`)
- Agent: `backend/agent.py` — canonical summarizer/analyzer and publisher of `live-metrics`
- DB schema and client: `src/db/schema.ts`, `src/db/client.ts`

Dev & debug (Windows bash)
```
npm install
npm run dev     # Next dev (turbopack)
npm run build
npm run start
npm run db:migrate    # run SQL migrations against $DATABASE_URL
```

Python agent (local run)
```
python -m venv .venv
.venv/Scripts/activate
pip install -r backend/requirements.txt
python backend/app.py
```

Important env vars
- LIVEKIT_API_KEY, LIVEKIT_API_SECRET
- SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL
- OPENAI_API_KEY or OPENROUTER_API_KEY (+ OPENROUTER_API_BASE)
- BACKEND_AGENT_URL (used to proxy summarization in some dev setups)

Repo-specific gotchas (do not change silently)
- The Python LiveKit agent is the single source of truth for realtime summaries/analysis — avoid re-enabling the disabled summarization endpoints (they return 501 intentionally).
- Transcripts and analysis are serialized JSON strings in text columns. Changing this shape requires coordinated updates to frontend routes and the agent.
- `src/db/client.ts` can skip `drizzle-orm` in some dev setups — migrations live in `drizzle/migrations/` (interviews) and `supabase/migrations/` (billing/profiles).

Quick troubleshooting checklist
- If frontend doesn't show live metrics: confirm the Python agent is running and publishing `live-metrics` packets with fields `confidence_score` and `professionalism_score` (0–100).
- If server-side reads fail to find a session: check the client `sb_access_token` cookie; `AuthProvider` should clear it on sign-out.
- When editing payment/webhook code, make small incremental changes and run the build after each logical block — earlier multi-block edits caused parse errors.

If you want a shorter snippet (startup commands, token path, or the `live-metrics` payload example) I can produce that next.


# Overview


# Important contracts


# Key files to inspect


# Env vars to know


# Dev & debug commands

```bash
npm install
npm run dev       # next dev (turbopack)
npm run build
npm run start
npm run db:migrate       # runs psql migrations against $DATABASE_URL
npm run db:migrate-node  # JS migration runner
```

Backend quick-run:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r backend/requirements.txt
python backend/app.py
```

# Project-specific gotchas (do not change these silently)


# Where to look first


<!--
Guidance for AI coding agents working on the interview-ai repository.
Keep this short, actionable, and tied to concrete files and patterns in the repo.
-->

# Quick onboarding (what matters most)

- This is a Next.js (App Router) + TypeScript frontend with a small Python backend agent (optional).
- Frontend API routes live under `src/app/api/*` and are the canonical integration points for summarization, LiveKit token generation, audio uploads, and interview analysis.
- Persistent data is stored in Supabase/Postgres; there are two migration sets: `drizzle/migrations/*.sql` (interviews) and `supabase/migrations/*.sql` (payments, profiles).

# Architecture & data flow (big picture)

- Client obtains a LiveKit token from `GET /api/livekit/token` implemented in `src/app/api/livekit/token/route.ts`. Response: `{ token, interviewId }`. The route also attempts to create an initial `interviews` row.
- The interview transcript is stored as JSON in the `interviews` table (see `src/db/schema.ts`) in a text column (`transcript`). Code expects a JSON string when reading/writing.
- Audio is uploaded by the client to `POST /api/interviews/audio/upload` (`src/app/api/interviews/audio/upload/route.ts`). The route expects a multipart/form-data with `interviewId` and `file` and an Authorization header (Supabase token). Files are saved to the Supabase storage bucket `interviews` and a signed URL is returned.
- Summarization is available at `src/app/api/ai/summary/route.ts`. Behavior in priority order:
 - Summarization is available at `src/app/api/ai/summary/route.ts` but this repository prefers the LiveKit agent (`backend/agent.py`) as the canonical analyzer. The route is disabled in-tree to avoid duplicate/conflicting analysis; in-room summaries are published by the agent over LiveKit data channels.
- Interview analysis uses OpenRouter/Claude in `src/app/api/interviews/analyze/route.ts`. It reads the `interviews` row via Supabase, composes a system prompt and returns structured JSON plus locally computed metrics (filler words, pauses, avg response length).

# Key files to inspect (examples of patterns)

- Token generation & DB seed: `src/app/api/livekit/token/route.ts` — creates LiveKit AccessToken and inserts/upserts an `interviews` row.
- Summarizer fallback logic: `src/app/api/ai/summary/route.ts` — proxies to `BACKEND_AGENT_URL` then OpenAI; payload shape and parsing are implemented here.
- Analyze logic and metrics: `src/app/api/interviews/analyze/route.ts` — calls OpenRouter, expects `interviews.transcript` JSON and returns `analysis` + `metrics`.
- Audio upload and Supabase storage usage: `src/app/api/interviews/audio/upload/route.ts` — requires Authorization (Supabase token), upserts interview audio metadata.
- DB schema: `src/db/schema.ts` — `interviews` table uses `transcript: text` and `analysis: text` columns; clients store JSON strings.
- DB client: `src/db/client.ts` — uses dynamic import for `drizzle-orm/node-postgres` (may be missing in some dev environments); code tolerates absence of drizzle.
- Frontend helper: `src/lib/fetchLivekitToken.ts` — example of consuming the token endpoint from the client-side and the returned shape.
- Backend agent: `backend/agent.py` and `backend/app.py` — optional Python FastAPI agent example for summarization and LiveKit agents.
 - Backend agent: `backend/agent.py` — the LiveKit interview agent is the canonical analyzer. The previous FastAPI HTTP summarizer has been removed to avoid duplication.

# Environment & runtime expectations
<!-- Copilot instructions: short, actionable, repository-specific -->

# Overview

- Tech: Next.js (App Router) + TypeScript frontend. Optional Python FastAPI backend in `backend/`.
- All server integrations live under `src/app/api/*` (LLM summarization, LiveKit token, audio uploads, analysis).
- Persistence: Supabase/Postgres. `drizzle/migrations/` manages interviews; `supabase/migrations/` manages payments/profiles.

# Important contracts

- GET `/api/livekit/token` → { token, interviewId? } (see `src/app/api/livekit/token/route.ts` — also upserts an `interviews` row).
- POST `/api/ai/summary` → { entries: Array<{who,text,ts?}> } (see `src/app/api/ai/summary/route.ts`). Proxy order: BACKEND_AGENT_URL -> OpenAI -> 501.
- POST `/api/interviews/audio/upload` → multipart form `interviewId`, `file`; requires `Authorization: Bearer <supabase-token>`; returns signed URL (see `src/app/api/interviews/audio/upload/route.ts`).

# Key files to inspect

- `src/app/api/livekit/token/route.ts` — LiveKit AccessToken + initial DB upsert.
- `src/app/api/ai/summary/route.ts` — fallback logic and JSON extraction heuristics when LLM returns markdown/text.
- `src/app/api/interviews/analyze/route.ts` — calls OpenRouter/Claude; reads `interviews.transcript` JSON string and returns `analysis` + computed `metrics`.
- `src/db/schema.ts` & `src/db/client.ts` — `interviews` table uses `transcript: text` and `analysis: text`; `src/db/client.ts` dynamically imports `drizzle-orm`.
- `backend/agent.py` / `backend/app.py` — optional local agent used when BACKEND_AGENT_URL is set.

# Env vars to know

- LIVEKIT_API_KEY, LIVEKIT_API_SECRET — LiveKit token generation.
- SUPABASE_URL + SUPABASE_ANON_KEY / SERVICE_KEY or DATABASE_URL — DB & storage.
- OPENAI_API_KEY or OPENROUTER_API_KEY (+ OPENROUTER_API_BASE) — LLM calls.
- BACKEND_AGENT_URL — if present, summarizer proxies to this service.
 - BACKEND_AGENT_URL — previously used to point the Next.js summarizer at a local Python summarizer; this mode is deprecated in this repo. Use the LiveKit agent instead.

# Dev & debug commands

```bash
npm install
npm run dev       # next dev (turbopack)
npm run build
npm run start
npm run db:migrate       # runs psql migrations against $DATABASE_URL
npm run db:migrate-node  # JS migration runner
```

Backend quick-run:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r backend/requirements.txt
python backend/app.py
```

# Project-specific gotchas (do not change these silently)

- Transcripts and analysis are stored as serialized JSON strings in text columns. Code expects `JSON.parse(row.transcript)`.
- The summarizer prefers BACKEND_AGENT_URL when set; tests and local dev often set this to the Python agent.
- `src/db/client.ts` will dynamically skip `drizzle-orm` if it's not installed; installing drizzle is only necessary for running migrations.
- Audio upload endpoints require a Supabase auth token and write `audio_path` + `audio_signed_url` to the interviews row.

# Where to look first

- `src/app/api/livekit/token/route.ts`, `src/app/api/ai/summary/route.ts`, `src/app/api/interviews/analyze/route.ts`, `src/app/api/interviews/audio/upload/route.ts`, `src/db/schema.ts`, `backend/agent.py`.

If anything is missing or you want sample requests, tell me which area to expand.
- LLM parsing errors → inspect raw LLM responses logged in `src/app/api/ai/summary/route.ts` and `src/app/api/interviews/analyze/route.ts`.
