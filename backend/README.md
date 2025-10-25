# LiveKit Python Agent (backend)

This folder contains a small scaffold for a LiveKit AI interviewer agent using `livekit.agents`.

Files

- `agent.py` - Example entrypoint using `VoiceAssistant` and plugins (OpenAI, Deepgram, Silero).
- `requirements.txt` - Suggested dependencies (adjust to match the package names you use).
- `.env.example` - Example environment variables you should set for local development.

Setup

1. Create a Python virtual environment and activate it:

```bash
python -m venv .venv
source .venv/bin/activate  # macOS / Linux
.\.venv\Scripts\activate   # Windows (PowerShell)
```

2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Copy `.env.example` to `.env` and fill in credentials:

```bash
cp .env.example .env
# edit .env and add keys
```

4. Run the agent:

```bash
python agent.py
```

Notes

- The `livekit.agents` package and plugin modules used in `agent.py` are representative; package names and APIs may differ by version. Adjust imports if necessary.
- Never commit real API keys. Use environment variables or a secrets manager.
- For local testing, ensure your LiveKit server is reachable and that your Next.js token generator uses the same API key/secret.

HTTP summarization wrapper archived
----------------------------------

The older FastAPI HTTP summarizer (`app.py` / `summary_agent.py`) has been archived under `backend/archive/` to avoid duplicate analysis paths. The LiveKit agent in `agent.py` is the canonical analyzer and publishes results in-room via LiveKit data channels.

If you need an HTTP summarization service in the future, prefer building a thin proxy that forwards requests to the agent or use a secure server-side upsert endpoint that the agent calls with results. The archived code is kept for reference in `backend/archive/` but is not used by the application.

*** End Patch