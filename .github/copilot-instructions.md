
<!-- Copilot instructions: concise, actionable, repo-specific -->

# Hroast — quick guide for coding agents

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
<!-- Copilot instructions: concise, actionable, repo-specific -->

# Hroast — quick guide for coding agents (short)

Purpose: help AI coding agents be productive quickly. Focus on the canonical flows, data shapes, and where to make safe changes.

Big picture
- Frontend: Next.js (App Router) TypeScript app under `src/app`.
- Canonical analyzer: Python LiveKit agent in `backend/` — it publishes realtime summaries and `live-metrics` to rooms. Prefer interacting with the agent or LiveKit data channels over re-enabling server-side summarizers.

Critical contracts (implementations to inspect before editing)
- GET /api/livekit/token → `src/app/api/livekit/token/route.ts` returns { token, interviewId } and upserts an `interviews` row.
- POST /api/interviews/audio/upload → `src/app/api/interviews/audio/upload/route.ts` (multipart form: `interviewId` + `file`). Requires `Authorization: Bearer <supabase-token>`; writes `audio_path` and `audio_signed_url` to the interview row.

Realtime & data shapes
- LiveKit data topics used by frontend: `agent-messages` / `interview_results` (summaries) and `live-metrics` (numeric metrics).
- `live-metrics` payload shape (example): { type: 'live_metrics', confidence_score: 0-100, professionalism_score: 0-100, filler_count: number, ai_feedback?: string, question_number?: number } — frontend maps 0–100 → 0–10.
- DB: `interviews` table (`src/db/schema.ts`) stores `transcript` and `analysis` as TEXT containing serialized JSON strings. Always treat them as JSON strings (use JSON.parse/JSON.stringify).

Where to look first (fast path)
- `src/app/api/livekit/token/route.ts` (token + interview seed)
- `src/app/api/interviews/audio/upload/route.ts` (audio upload + supabase storage)
- `src/app/api/interviews/analyze/route.ts` and `src/app/api/ai/summary/route.ts` (LLM/analyze logic and proxying)
- `backend/agent.py` (LiveKit agent — canonical analyzer)
- `src/db/schema.ts` and `src/db/client.ts` (DB shapes and dynamic drizzle import)

Dev & debug (Windows bash)
```bash
npm install
npm run dev       # Next dev (turbopack)
# to run the Python agent locally:
python -m venv .venv
.venv/Scripts/activate
pip install -r backend/requirements.txt
python backend/app.py
```

Important env vars
- LIVEKIT_API_KEY, LIVEKIT_API_SECRET
- SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL
- OPENAI_API_KEY or OPENROUTER_API_KEY (+ OPENROUTER_API_BASE)
- BACKEND_AGENT_URL (used in some dev setups; prefer LiveKit agent)

Repo-specific gotchas
- The Python LiveKit agent is the single source of realtime analysis — do not re-enable the disabled /api/ai/summary endpoints as the canonical source without coordinating with the agent.
- Changing interview storage shape (transcript/analysis) requires coordinated frontend/backend updates.
- `src/db/client.ts` may skip `drizzle-orm` if not installed; migrations live in `drizzle/migrations/` and `supabase/migrations/`.

If something is unclear or you want short examples (token request, live-metrics sample, or audio-upload curl), tell me which and I will add them.
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
