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
    // check Authorization header for a Supabase access token to associate an owner
    const authHeader = request.headers.get('authorization') || '';
    const tokenRaw = authHeader.startsWith('Bearer ') ? authHeader.replace('Bearer ', '').trim() : authHeader.trim();

    let ownerId: string | null = null;
    if (tokenRaw) {
      try {
        const { supabase } = await import('@/lib/supabaseClient');
        const { data: userData, error: userErr } = await supabase.auth.getUser(tokenRaw);
        if (!userErr && userData?.user) {
          ownerId = userData.user.id;
        }
      } catch (e) {
        console.warn('supabase auth.getUser failed', e);
      }
    }

    const identity = ownerId || username;
    const token = new AccessToken(apiKey, apiSecret, { identity });
    // Grant basic room permissions (allow data publish too)
    token.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });

    const jwt = await token.toJwt();

    // create an interview record on the server and return its id to the client
    const interviewId = `iv_${Math.random().toString(36).slice(2, 10)}`;

    // Prefer using Supabase service role (server-side) if available. This avoids
    // direct PG connections which may fail in some dev/network environments.
    const { supabase } = await import('@/lib/supabaseClient');
    const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (hasServiceRole && supabase) {
      try {
        await supabase.from('interviews').upsert({ id: interviewId, transcript: JSON.stringify([]), analysis: JSON.stringify({}), status: 'started', owner: ownerId });
        console.info('Created interview row via Supabase service role');
      } catch (e) {
        console.warn('Supabase (service role) create interview failed, will try PG if configured', e);
      }
    } else {
      // Try direct PG write then supabase fallback (anon key)
      const DATABASE_URL = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
      if (DATABASE_URL) {
        try {
          const { Pool } = await import('pg');
          const pool = new Pool({ connectionString: DATABASE_URL });
          const q = `INSERT INTO interviews (id, transcript, analysis, status, created_at, owner) VALUES ($1,$2,$3,$4, now(), $5) ON CONFLICT (id) DO NOTHING`;
          await pool.query(q, [interviewId, JSON.stringify([]), JSON.stringify({}), 'started', ownerId]);
          await pool.end();
          console.info('Created interview row via direct PG connection');
        } catch (pgErr) {
    console.warn('PG create interview failed, will try Supabase anon fallback', String(pgErr));
        }
      }

      try {
        // Upsert using whatever supabase client is available (may be anon key)
        await supabase.from('interviews').upsert({ id: interviewId, transcript: JSON.stringify([]), analysis: JSON.stringify({}), status: 'started', owner: ownerId });
        console.info('Created interview row via Supabase fallback');
      } catch (e) {
        // non-fatal; interview will still be created client-side on upload
  console.warn('supabase create interview failed (fallback)', String(e));
      }
    }

    // NOTE: Auto Egress should be configured in the LiveKit dashboard for automatic recordings.
    // We intentionally do not start egress programmatically here to prefer Auto Egress.

    return NextResponse.json({ token: jwt, interviewId });
  } catch (e) {
    console.error("Failed to generate LiveKit token", e);
    return NextResponse.json({ error: "token_generation_failed" }, { status: 500 });
  }
}
