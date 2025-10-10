import { NextResponse } from "next/server";

const OPENAI_API = "https://api.openai.com/v1/chat/completions";

async function fetchWithTimeout(url: string, opts: RequestInit = {}, timeout = 20_000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal, ...opts });
    return res;
  } finally {
    clearTimeout(id);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const entries = body?.entries ?? [];

    // 1) If a backend agent HTTP service is provided, proxy the request to it.
    const backendUrl = process.env.BACKEND_AGENT_URL;
    if (backendUrl) {
      try {
        const proxied = await fetchWithTimeout(`${backendUrl.replace(/\/$/, "")}/api/summary`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entries }),
        }, 20_000);
        if (proxied.ok) {
          const data = await proxied.json();
          return NextResponse.json(data);
        } else {
          console.warn("backend agent responded with status", proxied.status);
        }
      } catch {
        console.warn("proxy to backend agent failed");
      }
    }

    // 2) If OPENAI_API_KEY is present, call OpenAI to produce a structured JSON summary.
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (OPENAI_API_KEY) {
      const model = process.env.OPENAI_MODEL ?? "gpt-3.5-turbo";

      const systemPrompt = `You are an assistant that summarizes interview transcripts into a compact JSON object with the following fields: score (integer 0-100), tone (short string, e.g. Positive/Hesitant/Neutral), pacing (Slow/Good/Fast), notes (short bullet points or paragraph). Respond with ONLY valid JSON.`;

      const userPrompt = `Here are the transcript entries as an array of objects with {who, text, ts}:\n${JSON.stringify(entries)}\n\nProduce a JSON object: { "score": <int>, "tone": "<string>", "pacing": "<string>", "notes": "<string>" }.`;

      const payload = {
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 400,
      };

      const res = await fetchWithTimeout(OPENAI_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify(payload),
      }, 20_000);

      if (!res.ok) {
        const text = await res.text();
        console.error("OpenAI error", res.status, text);
        return NextResponse.json({ error: "OpenAI API error" }, { status: 502 });
      }

      const json = await res.json();
      const content = json?.choices?.[0]?.message?.content ?? json?.choices?.[0]?.text;
      if (!content) return NextResponse.json({ error: "No content from OpenAI" }, { status: 502 });

      // attempt to extract JSON from content
      const maybeJson = (() => {
        try {
          return JSON.parse(String(content));
        } catch {
          // try to find first {...} in string
          const m = String(content).match(/\{[\s\S]*\}/);
          if (m) {
            try {
              return JSON.parse(m[0]);
            } catch {
              return null;
            }
          }
          return null;
        }
      })();

      if (!maybeJson) {
        return NextResponse.json({ error: "Failed to parse JSON from OpenAI response", raw: content }, { status: 502 });
      }

      // Basic validation/normalization
      const mj = maybeJson as Record<string, unknown>;
      const out = {
        score: typeof mj.score === "number" ? Math.max(0, Math.min(100, Math.round(mj.score as number))) : 0,
        tone: String(mj.tone ?? "Neutral"),
        pacing: String(mj.pacing ?? "Good"),
        notes: String(mj.notes ?? ""),
      };
      return NextResponse.json(out);
    }

    // 3) Nothing available
    return NextResponse.json({ message: "No summarization backend configured" }, { status: 501 });
  } catch (err: unknown) {
    console.error("summary route error", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ message: "POST entries to summarize; configure BACKEND_AGENT_URL or OPENAI_API_KEY for production." });
}
