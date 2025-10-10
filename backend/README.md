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

FastAPI wrapper (HTTP)
----------------------

This repository also includes a small FastAPI wrapper to expose a simple HTTP summarization endpoint. It lives in `app.py` and provides `POST /api/summary` which accepts the transcript entries (array of {who, text, ts}) and returns a compact summary.

Run locally:

```bash
python -m venv .venv
source .venv/bin/activate   # on Windows use .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Run with Docker:

```bash
docker build -t interview-agent .
docker run -p 8000:8000 interview-agent
```

When running, point the Next.js env var `BACKEND_AGENT_URL` at this service (e.g. `http://localhost:8000`) so the Next summarizer will proxy requests to it.

*** End Patch