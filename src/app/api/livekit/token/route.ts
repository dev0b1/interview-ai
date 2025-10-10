import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const username = url.searchParams.get("username");
  const room = url.searchParams.get("room");

  if (!username || !room) {
    return NextResponse.json({ error: "Missing room or username" }, { status: 400 });
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  try {
    const token = new AccessToken(apiKey, apiSecret, { identity: username });
    // Grant basic room permissions
    token.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true });

    const jwt = await token.toJwt();

    // create an interview record on the server and return its id to the client
    const interviewId = `iv_${Math.random().toString(36).slice(2, 10)}`;
    // Try direct PG write then supabase fallback
    const DATABASE_URL = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
    if (DATABASE_URL) {
      try {
        const { Pool } = await import('pg');
        const pool = new Pool({ connectionString: DATABASE_URL });
        const q = `INSERT INTO interviews (id, transcript, analysis, status, created_at) VALUES ($1,$2,$3,$4, now()) ON CONFLICT (id) DO NOTHING`;
        await pool.query(q, [interviewId, JSON.stringify([]), JSON.stringify({}), 'started']);
        await pool.end();
      } catch (pgErr) {
        console.warn('PG create interview failed, will try supabase', pgErr);
      }
    }
    try {
      const { supabase } = await import('@/lib/supabaseClient');
      // upsert initial row
      await supabase.from('interviews').upsert({ id: interviewId, transcript: JSON.stringify([]), analysis: JSON.stringify({}), status: 'started' });
    } catch (e) {
      // non-fatal; interview will still be created client-side on upload
      console.warn('supabase create interview failed', e);
    }

    return NextResponse.json({ token: jwt, interviewId });
  } catch (e) {
    console.error("Failed to generate LiveKit token", e);
    return NextResponse.json({ error: "token_generation_failed" }, { status: 500 });
  }
}
