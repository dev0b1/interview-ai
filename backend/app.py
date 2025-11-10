from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Literal
import uvicorn
import re
import os
import json

try:
    import openai
except Exception:
    openai = None

# The HTTP summarizer (summary_agent) has been removed. The LiveKit agent in
# `agent.py` is the canonical analyzer. Keep a None placeholder so the app
# continues to run without raising ImportError when checking for a summarizer.
summarize_with_livekit = None

class Entry(BaseModel):
    who: Literal["AI", "User"]
    text: str
    ts: int

class SummaryOut(BaseModel):
    score: int
    tone: str
    pacing: str
    notes: str

app = FastAPI(title="Interview AI Agent Proxy")


def local_summarize(entries: List[Entry]) -> SummaryOut:
    user_entries = [e for e in entries if e.who == "User"]
    total_user_words = sum(len(re.findall(r"\S+", e.text)) for e in user_entries)
    avg_words = (total_user_words / len(user_entries)) if user_entries else 0
    pacing = "Slow" if avg_words < 8 else "Good" if avg_words < 20 else "Fast"
    text_all = " ".join(e.text for e in entries).lower()
    tone = "Neutral"
    if re.search(r"thank|great|excellent|awesome|confident", text_all):
        tone = "Positive"
    if re.search(r"\bum\b|\buh\b|like\b|maybe\b|sorry", text_all):
        tone = "Hesitant"
    score = int(min(100, max(0, 40 + len(user_entries) * 8 + min(20, avg_words))))
    notes = "\n".join(f"• {e.text}" for e in user_entries[-3:])
    return SummaryOut(score=score, tone=tone, pacing=pacing, notes=notes)


@app.post("/api/summary", response_model=SummaryOut)
async def summarize(entries: List[Entry]):
    """
    Summarize interview transcript entries.

    This is a minimal implementation that performs a quick heuristic summary.
    Replace or extend this function to call your LLM/STT/analysis stack.
    """
    try:
        # If configured, prefer the livekit-backed summarizer
        use_livekit = os.environ.get("USE_LIVEKIT_AGENT") == "1" or summarize_with_livekit is not None
        if use_livekit and summarize_with_livekit is not None:
            try:
                parsed = summarize_with_livekit([e.dict() for e in entries])
                return SummaryOut(score=int(parsed.get("score", 0)), tone=str(parsed.get("tone", "Neutral")), pacing=str(parsed.get("pacing", "Good")), notes=str(parsed.get("notes", "")))
            except Exception as e:
                print("summary_agent failed, falling back:", e)

        # If OPENAI_API_KEY is set, prefer using server-side OpenAI to produce a structured summary
        OPENAI_KEY = os.environ.get("OPENAI_API_KEY")
        model = os.environ.get("OPENAI_MODEL", "gpt-3.5-turbo")
        if OPENAI_KEY and openai is not None:
            try:
                openai.api_key = OPENAI_KEY
                system_prompt = (
                    "You are an assistant that summarizes interview transcripts into a compact JSON object with the following fields: "
                    "score (integer 0-100), tone (short string, e.g. Positive/Hesitant/Neutral), pacing (Slow/Good/Fast), notes (short bullet points or paragraph). Respond with ONLY valid JSON."
                )
                user_prompt = f"Here are the transcript entries as an array of objects with {{who, text, ts}}:\n{json.dumps([e.dict() for e in entries])}\n\nProduce a JSON object: {{ \"score\": <int>, \"tone\": \"<string>\", \"pacing\": \"<string>\", \"notes\": \"<string>\" }}."

                resp = openai.ChatCompletion.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0.2,
                    max_tokens=400,
                )
                content = None
                try:
                    content = resp.choices[0].message.content
                except Exception:
                    content = resp.choices[0].text if resp.choices and hasattr(resp.choices[0], "text") else None

                if not content:
                    raise Exception("No content returned from OpenAI")

                # attempt to parse JSON from content
                try:
                    parsed = json.loads(content)
                except Exception:
                    m = re.search(r"\{[\s\S]*\}", content)
                    if m:
                        try:
                            parsed = json.loads(m.group(0))
                        except Exception:
                            parsed = None
                    else:
                        parsed = None

                if parsed:
                    out = SummaryOut(
                        score=int(max(0, min(100, int(parsed.get("score", 0))))),
                        tone=str(parsed.get("tone", "Neutral")),
                        pacing=str(parsed.get("pacing", "Good")),
                        notes=str(parsed.get("notes", "")),
                    )
                    return out
                else:
                    # fall back to local heuristic if parsing fails
                    return local_summarize(entries)
            except Exception as e:
                # don't fail hard; fall back to local summarizer
                print("openai summarization failed:", e)
                return local_summarize(entries)

        # Fallback to local heuristic summarizer
        out = local_summarize(entries)
        return out
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    # Respect the PORT and HOST environment variables for portability (Render, Docker, etc.)
    port = int(os.environ.get("PORT", "8000"))
    host = os.environ.get("HOST", "0.0.0.0")
    print(f"Starting backend on {host}:{port}")
    uvicorn.run(app, host=host, port=port)
