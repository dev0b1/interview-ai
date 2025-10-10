"""
Optional summary wrapper that attempts to use livekit.agents internals to produce richer summaries.

This module is defensive: it will try to use livekit.agents.llm if present, otherwise fall back to OpenAI (if available) or a local heuristic.
Use by setting the env var USE_LIVEKIT_AGENT=1 and ensuring the appropriate packages and credentials are available.
"""
from typing import List, Dict
import os
import json
import re

def local_summarize(entries: List[Dict]) -> Dict:
    user_entries = [e for e in entries if e.get("who") == "User"]
    total_user_words = sum(len(re.findall(r"\S+", e.get("text", ""))) for e in user_entries)
    avg_words = (total_user_words / len(user_entries)) if user_entries else 0
    pacing = "Slow" if avg_words < 8 else "Good" if avg_words < 20 else "Fast"
    text_all = " ".join(e.get("text", "") for e in entries).lower()
    tone = "Neutral"
    if re.search(r"thank|great|excellent|awesome|confident", text_all):
        tone = "Positive"
    if re.search(r"\bum\b|\buh\b|like\b|maybe\b|sorry", text_all):
        tone = "Hesitant"
    score = int(min(100, max(0, 40 + len(user_entries) * 8 + min(20, avg_words))))
    notes = "\n".join(f"• {e.get('text', '')}" for e in user_entries[-3:])
    return {"score": score, "tone": tone, "pacing": pacing, "notes": notes}


def summarize_with_livekit(entries: List[Dict]) -> Dict:
    """
    Try to summarize using livekit.agents.llm internals if available.
    Falls back to OpenAI (if configured) or the local heuristic.
    """
    # 1) attempt to use livekit.agents.llm
    try:
        from livekit.agents import llm as lkllm
    except Exception:
        lkllm = None

    system_prompt = (
        "You are a professional interviewer assistant. Summarize the provided interview transcript entries "
        "into a JSON object with fields: score (0-100), tone (Positive/Hesitant/Neutral), pacing (Slow/Good/Fast), notes (short bullets)."
    )
    user_prompt = f"Here are the entries as JSON:\n{json.dumps(entries)}\nReturn only valid JSON."

    if lkllm is not None:
        try:
            # Try to use ChatContext for a nicer prompt formatting if available
            try:
                ctx = lkllm.ChatContext()
                ctx.append(role="system", text=system_prompt)
                ctx.append(role="user", text=user_prompt)
                prompt_payload = ctx
            except Exception:
                prompt_payload = None

            # Try to construct an LLM client if available in livekit.agents.llm
            if hasattr(lkllm, "LLM"):
                try:
                    LLM = getattr(lkllm, "LLM")
                    api_key = os.environ.get("OPENAI_API_KEY")
                    model = LLM(api_key=api_key) if api_key else LLM()
                    # Try common method names safely
                    if hasattr(model, "chat"):
                        resp = model.chat([{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}])
                        # model.chat might return a string or an object
                        content = resp if isinstance(resp, str) else getattr(resp, "content", None) or str(resp)
                    elif hasattr(model, "complete"):
                        resp = model.complete(user_prompt)
                        content = resp if isinstance(resp, str) else getattr(resp, "text", None) or str(resp)
                    else:
                        content = None

                    if content:
                        # try to extract JSON
                        try:
                            parsed = json.loads(content)
                        except Exception:
                            m = re.search(r"\{[\s\S]*\}", content)
                            parsed = json.loads(m.group(0)) if m else None
                        if parsed:
                            return {
                                "score": int(parsed.get("score", 0)),
                                "tone": str(parsed.get("tone", "Neutral")),
                                "pacing": str(parsed.get("pacing", "Good")),
                                "notes": str(parsed.get("notes", "")),
                            }
                except Exception:
                    # ignore and fallback
                    pass
        except Exception:
            pass

    # 2) fallback: try server-side OpenAI via openai package if available
    try:
        import openai
        OPENAI_KEY = os.environ.get("OPENAI_API_KEY")
        if OPENAI_KEY:
            openai.api_key = OPENAI_KEY
            model = os.environ.get("OPENAI_MODEL", "gpt-3.5-turbo")
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
                try:
                    content = resp.choices[0].text
                except Exception:
                    content = None

            if content:
                try:
                    parsed = json.loads(content)
                except Exception:
                    m = re.search(r"\{[\s\S]*\}", content)
                    parsed = json.loads(m.group(0)) if m else None
                if parsed:
                    return {
                        "score": int(parsed.get("score", 0)),
                        "tone": str(parsed.get("tone", "Neutral")),
                        "pacing": str(parsed.get("pacing", "Good")),
                        "notes": str(parsed.get("notes", "")),
                    }
    except Exception:
        pass

    # 3) final fallback: local heuristic
    return local_summarize(entries)
