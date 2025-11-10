import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

/**
 * Cleanup route to refund credits for interviews that were started but never
 * completed. Intended to be invoked periodically (cron) or manually.
 *
 * Behavior:
 * - Finds interviews with status = 'started' and created_at older than the
 *   configured threshold (CREDIT_REFUND_MINUTES, default 15).
 * - For each interview with an `owner`, increments profiles.credits by 1 and
 *   marks the interview status as 'expired' to avoid double refunds.
 *
 * Note: This route requires the Supabase service role key for safe writes in
 * production. It tries best-effort updates and logs warnings on failures.
 */

export async function POST(req: NextRequest) {
  try {
    const MINUTES = Number(process.env.CREDIT_REFUND_MINUTES ?? '15');
    const cutoff = new Date(Date.now() - MINUTES * 60 * 1000).toISOString();

    // Fetch interviews that are stuck in 'started' older than cutoff
    const { data: rows, error: selErr } = await supabase
      .from('interviews')
      .select('id, owner, created_at, status')
      .eq('status', 'started')
      .lte('created_at', cutoff);

    if (selErr) {
      console.error('cleanup: failed to query interviews', selErr);
      return NextResponse.json({ error: 'query_failed' }, { status: 500 });
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ ok: true, refunded: 0 });
    }

    let refunded = 0;

    for (const r of rows) {
      try {
        const id = (r as any).id as string;
        const owner = (r as any).owner as string | null;

        // Mark interview expired first to avoid races
        const { error: updInterviewErr } = await supabase
          .from('interviews')
          .update({ status: 'expired' })
          .eq('id', id)
          .eq('status', 'started');

        if (updInterviewErr) {
          console.warn('cleanup: failed to mark interview expired', id, updInterviewErr);
          continue;
        }

        if (!owner) continue;

        // Read current credits
        const { data: profile } = await supabase.from('profiles').select('credits').eq('id', owner).limit(1).maybeSingle();
        const current = profile ? Number((profile as any).credits ?? 0) : 0;

        // Increment credits by 1
        const { error: updErr } = await supabase.from('profiles').update({ credits: current + 1 }).eq('id', owner);
        if (updErr) {
          console.warn('cleanup: failed to refund credit to owner', owner, updErr);
          continue;
        }

        refunded += 1;
      } catch (inner) {
        console.warn('cleanup: error processing row', inner);
        continue;
      }
    }

    return NextResponse.json({ ok: true, refunded });
  } catch (err) {
    console.error('cleanup error', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
