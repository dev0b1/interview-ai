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

    // Before creating an interview row, enforce per-user limits.
    // Defaults (can be overridden via env):
    //  - MAX_INTERVIEWS_FREE (default 3) -- total allowed for unsubscribed users
    //  - MAX_INTERVIEWS_SUBSCRIBED_MONTHLY (default 20) -- monthly allowed for subscribed users
    const { supabase } = await import('@/lib/supabaseClient');

    const MAX_FREE = Number(process.env.MAX_INTERVIEWS_FREE ?? '3');
    const MAX_SUB_MONTHLY = Number(process.env.MAX_INTERVIEWS_SUBSCRIBED_MONTHLY ?? '20');

    // If we have an authenticated owner, check their subscription and interview counts.
    let isSubscribed = false;
    if (ownerId) {
      try {
        // Check for active subscription. Prefer subscriptions table, but also
        // fall back to the profiles.pro + pro_expires_at fields in case the
        // subscriptions row isn't present yet.
        const { data: subs } = await supabase
          .from('subscriptions')
          .select('status, current_period_end')
          .eq('user_id', ownerId)
          .limit(1);

  // local assignment to outer-scoped isSubscribed
  isSubscribed = false;
        if (Array.isArray(subs) && subs.length > 0) {
          const s = subs[0] as any;
          const statusActive = s.status === 'active';
          const periodEnd = s.current_period_end ? new Date(s.current_period_end) : null;
          const notExpired = !periodEnd || periodEnd > new Date();
          isSubscribed = statusActive && notExpired;
        } else {
          // Fallback: read profiles.pro + pro_expires_at
          const { data: profile } = await supabase.from('profiles').select('pro, pro_expires_at').eq('id', ownerId).limit(1).maybeSingle();
          if (profile) {
            const pro = Boolean((profile as any).pro);
            const expires = (profile as any).pro_expires_at ? new Date((profile as any).pro_expires_at) : null;
            isSubscribed = pro && (!expires || expires > new Date());
          }
        }

        if (isSubscribed) {
          // Count interviews created this month
          const now = new Date();
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
          const { count } = await supabase
            .from('interviews')
            .select('id', { count: 'exact' })
            .eq('owner', ownerId)
            .gte('created_at', startOfMonth);

          if ((count ?? 0) >= MAX_SUB_MONTHLY) {
            console.warn(`Interview limit reached for subscribed user ${ownerId}: ${count}/${MAX_SUB_MONTHLY}`);
            return NextResponse.json({ error: 'monthly_limit_exceeded', message: `Subscribed users may create up to ${MAX_SUB_MONTHLY} interviews per month.` }, { status: 403 });
          }
        } else {
          // Unsubscribed users: enforce a total interview limit
          const { count } = await supabase
            .from('interviews')
            .select('id', { count: 'exact' })
            .eq('owner', ownerId);

          if ((count ?? 0) >= MAX_FREE) {
            console.warn(`Interview limit reached for free user ${ownerId}: ${count}/${MAX_FREE}`);
            return NextResponse.json({ error: 'free_limit_exceeded', message: `Free users may create up to ${MAX_FREE} interviews. Upgrade to increase this limit.` }, { status: 403 });
          }
        }
      } catch (e) {
        console.warn('Failed to check interview limits; allowing interview by default', e);
      }
    }

    // If the user is authenticated and not subscribed, attempt to consume a credit
    // (purchased credits grant interview capacity). This decrements `profiles.credits`
    // atomically via a conditional update so we don't go negative.
    if (ownerId) {
      try {
        // Check subscription status again (we already computed isSubscribed above)
        if (!isSubscribed) {
          const { data: profile } = await supabase.from('profiles').select('credits').eq('id', ownerId).limit(1).maybeSingle();
          const currentCredits = profile ? Number((profile as any).credits ?? 0) : 0;
          if (currentCredits > 0) {
            // decrement by 1 only if credits > 0
            const { data: updated, error: updErr } = await supabase
              .from('profiles')
              .update({ credits: currentCredits - 1 })
              .eq('id', ownerId)
              .gt('credits', 0)
              .select()
              .limit(1)
              .maybeSingle();

            if (updErr) {
              console.warn('Failed to decrement credits for user', ownerId, updErr);
            } else if (updated) {
              console.info(`Consumed 1 credit for user ${ownerId}; remaining=${(updated as any).credits}`);
            }
          }
        }
      } catch (err) {
        console.warn('Failed to consume credit at token creation', err);
      }
    }

    // create an interview record on the server and return its id to the client
    const interviewId = `iv_${Math.random().toString(36).slice(2, 10)}`;

  // Prefer using Supabase service role (server-side) if available. This avoids
  // direct PG connections which may fail in some dev/network environments.
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

  // NOTE: This project now prefers manual egress control so users can choose
  // whether to record. Use the API endpoints:
  //  - POST /api/livekit/egress/start to start a recording programmatically
  //  - POST /api/livekit/egress/stop to stop a recording (use egressId returned from start)
  // The fallback route POST /api/livekit/egress/list can still be used to discover completed recordings.

    return NextResponse.json({ token: jwt, interviewId });
  } catch (e) {
    console.error("Failed to generate LiveKit token", e);
    return NextResponse.json({ error: "token_generation_failed" }, { status: 500 });
  }
}
