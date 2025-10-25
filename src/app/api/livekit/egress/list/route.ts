import { NextResponse } from 'next/server';
import { RoomServiceClient } from 'livekit-server-sdk';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const roomName = String(body.roomName || '');
    const interviewId = String(body.interviewId || '');

    if (!roomName || !interviewId) {
      return NextResponse.json({ error: 'missing roomName or interviewId' }, { status: 400 });
    }

    const livekitUrl = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL;
    const livekitKey = process.env.LIVEKIT_API_KEY;
    const livekitSecret = process.env.LIVEKIT_API_SECRET;

    if (!livekitUrl || !livekitKey || !livekitSecret) {
      return NextResponse.json({ error: 'livekit not configured' }, { status: 500 });
    }

  type SvcLike = { listEgress?: (opts: { roomName: string }) => Promise<Record<string, unknown>> };
  const svc = new RoomServiceClient(livekitUrl, livekitKey, livekitSecret) as unknown as SvcLike;
    if (typeof svc.listEgress !== 'function') {
      // server SDK doesn't expose listEgress in this runtime; return not implemented
      return NextResponse.json({ error: 'listEgress not available on RoomServiceClient' }, { status: 501 });
    }
  const list = await svc.listEgress({ roomName });

    // choose first file result with a downloadUrl
    let recordingUrl: string | null = null;
    const egressArr = Array.isArray((list as Record<string, unknown>)['egress']) ? ((list as Record<string, unknown>)['egress'] as unknown[]) : [];
    for (const r of egressArr) {
      const rObj = r as Record<string, unknown>;
      const frArr = Array.isArray(rObj['fileResults']) ? (rObj['fileResults'] as unknown[]) : [];
      const fr = frArr[0] as Record<string, unknown> | undefined;
      const downloadUrl = fr ? String(fr['downloadUrl'] || fr['filepath'] || '') : '';
      if (downloadUrl) { recordingUrl = downloadUrl; break; }
    }

    if (!recordingUrl) {
      return NextResponse.json({ ok: false, message: 'no recording yet' }, { status: 404 });
    }

    // persist to interviews table (try PG then supabase)
    const DATABASE_URL = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
    if (DATABASE_URL) {
      try {
        const { Pool } = await import('pg');
        const pool = new Pool({ connectionString: DATABASE_URL });
        const q = `UPDATE interviews SET audio_signed_url = $1 WHERE id = $2`;
        await pool.query(q, [recordingUrl, interviewId]);
        await pool.end();
      } catch (pgErr) {
        console.warn('pg persist recording url failed', pgErr);
      }
    }

    try {
      const { supabase } = await import('@/lib/supabaseClient');
      await supabase.from('interviews').update({ audio_signed_url: recordingUrl }).eq('id', interviewId);
    } catch (e) {
      console.warn('supabase persist recording url failed', e);
    }

    return NextResponse.json({ ok: true, recordingUrl });
  } catch (err) {
    console.error('egress list error', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
