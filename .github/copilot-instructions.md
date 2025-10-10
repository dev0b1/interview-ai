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
  1. If `BACKEND_AGENT_URL` is set, proxy the request to that backend agent's `/api/summary`.
  2. Else if `OPENAI_API_KEY` is set, call OpenAI to generate a JSON summary from entries (expects entries: Array<{who,text,ts}>).
  3. Else return 501 with a message describing missing configuration.
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

# Environment & runtime expectations

- Required (for full functionality):
  - LIVEKIT_API_KEY, LIVEKIT_API_SECRET — used by the token generator (`/api/livekit/token`).
  - SUPABASE keys / DATABASE_URL — used by Supabase client and server-side DB writes.
  - OPENAI_API_KEY or OPENROUTER_API_KEY (OPENROUTER_API_BASE + OPENROUTER_API_KEY) — used by summarization or analysis routes.
  - BACKEND_AGENT_URL — optional; if present, summarizer proxies to this HTTP service (e.g., `http://localhost:8000`).

# Developer workflows & commands

- Install and run dev frontend:
  - npm install
  - npm run dev  (uses `next dev --turbopack`)
- Build and start production:
  - npm run build
  - npm run start
- DB migrations / seeding:
  - `npm run db:migrate` runs two psql commands against $DATABASE_URL (see `package.json`).
  - `npm run db:migrate-node` runs `scripts/run-migrations.js` for JS-driven migrations.
  - For Supabase-specific migrations see `supabase/migrations/` and `package.json`'s `db:push` script.
- Backend Python agent (optional):
  - Create venv, pip install -r `backend/requirements.txt`, then run `python backend/app.py` or `python backend/agent.py`.
  - Docker: build using `backend/Dockerfile` and run; point `BACKEND_AGENT_URL` at the container.

# Project-specific conventions and gotchas

- Transcript storage: transcripts are stored as serialized JSON in a text field. When reading, the code commonly does `JSON.parse(rows[0].transcript)` and expects an array of objects with { speaker/ who, text, ts }.
- Authorization: the audio upload endpoint expects a Supabase auth token in the Authorization header and will call `supabase.auth.getUser(token)`.
- Signed URLs: uploads create signed URLs via `supabase.storage.from('interviews').createSignedUrl(...)` and store `audio_path` and `audio_signed_url` back to the interviews row.
- Dynamic imports: `src/db/client.ts` dynamically imports `drizzle-orm` so some dev environments may not have it installed; code handles this gracefully — installing drizzle is optional for quick frontend-only changes.
- External LLM providers: analysis uses OpenRouter/Claude with a strict JSON response format; the Summarizer expects parsable JSON from OpenAI and tries to heuristically extract JSON if the model returns markdown or text.

# Contract snippets (copyable examples)

- Token GET (frontend calls `src/lib/fetchLivekitToken.ts`): returns `{ token: string, interviewId?: string }`.
- Summary POST payload (client -> `src/app/api/ai/summary/route.ts`): `{ entries: Array<{ who: string, text: string, ts?: string }> }` -> returns `{ score, tone, pacing, notes }` or proxies to backend agent output.
- Audio upload form (multipart/form-data): fields `interviewId`, `file`; requires `Authorization: Bearer <supabase-token>` header. Response includes `{ ok: true, path, signedUrl }`.

# Troubleshooting hints

- If LiveKit token generation fails: ensure `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` are set. Check server logs in `src/app/api/livekit/token/route.ts` for stack traces.
- If OpenAI/OpenRouter calls return parsing errors: inspect the raw LLM response logged by the route and adjust model/ prompt (see `src/app/api/interviews/analyze/route.ts` and `src/app/api/ai/summary/route.ts`).
- If DB writes fail locally, the routes attempt both direct PG writes (via `DATABASE_URL`) and Supabase upserts — set whichever you use.

# Where to look next

- Start with these files: `src/app/api/livekit/token/route.ts`, `src/app/api/ai/summary/route.ts`, `src/app/api/interviews/analyze/route.ts`, `src/app/api/interviews/audio/upload/route.ts`, `src/db/schema.ts`, `backend/agent.py`.

If anything here is unclear or you'd like more examples (sample requests/responses or common PR patterns), tell me which section to expand and I will iterate.
