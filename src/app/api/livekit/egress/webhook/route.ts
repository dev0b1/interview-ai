import { NextRequest, NextResponse } from 'next/server';

// Optional shared secret to validate incoming webhooks
const WEBHOOK_SECRET = process.env.LIVEKIT_EGRESS_WEBHOOK_SECRET || '';

async function extractRecordingInfo(payload: Record<string, unknown>) {
  // Try several common shapes returned by egress / RoomService
  // 1) top-level fileResults
  let filepath: string | null = null;
  let downloadUrl: string | null = null;

  try {
    const maybeFileResults = payload['fileResults'];
    if (Array.isArray(maybeFileResults) && maybeFileResults.length > 0) {
      const fr = maybeFileResults[0] as Record<string, unknown>;
      downloadUrl = typeof fr['downloadUrl'] === 'string' ? (fr['downloadUrl'] as string) : null;
      filepath = typeof fr['filepath'] === 'string' ? (fr['filepath'] as string) : null;
    }

    // 2) nested egress.fileResults
    if (!downloadUrl) {
      const egress = payload['egress'];
      if (egress && typeof egress === 'object') {
        const egressObj = egress as Record<string, unknown>;
        const maybeEgressFR = egressObj['fileResults'];
        if (Array.isArray(maybeEgressFR) && maybeEgressFR.length > 0) {
          const fr = maybeEgressFR[0] as Record<string, unknown>;
          downloadUrl = typeof fr['downloadUrl'] === 'string' ? (fr['downloadUrl'] as string) : null;
          filepath = typeof fr['filepath'] === 'string' ? (fr['filepath'] as string) : null;
        }
      }
    }

    // 3) nested result or output shapes
    if (!downloadUrl) {
      const result = payload['result'];
      if (result && typeof result === 'object') {
        const resultObj = result as Record<string, unknown>;
        const maybeResultFR = resultObj['fileResults'];
        if (Array.isArray(maybeResultFR) && maybeResultFR.length > 0) {
          const fr = maybeResultFR[0] as Record<string, unknown>;
          downloadUrl = typeof fr['downloadUrl'] === 'string' ? (fr['downloadUrl'] as string) : null;
          filepath = typeof fr['filepath'] === 'string' ? (fr['filepath'] as string) : null;
        }
      }
    }

    if (!downloadUrl) {
      const output = payload['output'];
      if (output && typeof output === 'object') {
        const outputObj = output as Record<string, unknown>;
        downloadUrl = typeof outputObj['downloadUrl'] === 'string' ? (outputObj['downloadUrl'] as string) : (typeof outputObj['url'] === 'string' ? (outputObj['url'] as string) : null);
        if (typeof outputObj['filepath'] === 'string') {
          filepath = outputObj['filepath'] as string;
        } else if (outputObj['file'] && typeof outputObj['file'] === 'object') {
          const fileObj = outputObj['file'] as Record<string, unknown>;
          if (typeof fileObj['filepath'] === 'string') filepath = fileObj['filepath'] as string;
        }
      }
    }

    // 4) some runtimes include `file` with filepath
    if (!filepath) {
      const file = payload['file'];
      if (file && typeof file === 'object') {
        const fileObj = file as Record<string, unknown>;
        if (typeof fileObj['filepath'] === 'string') filepath = fileObj['filepath'] as string;
      }
    }

    // 5) fallback to top-level filepath
  if (!filepath && typeof payload['filepath'] === 'string') filepath = payload['filepath'] as string;

    return { filepath, downloadUrl };
  } catch {
    return { filepath: null, downloadUrl: null }; // ignore
  }
}

function parseInterviewIdFromPath(filepath: string | null) {
  if (!filepath) return null;
  // Expect path like 'interviews/<interviewId>.mp4' or similar
  const m = String(filepath).match(/interviews\/(?:([^/.]+))/i);
  if (m && m[1]) return m[1];
  return null;
}

export async function POST(req: NextRequest) {
  try {
    // optional secret header
    if (WEBHOOK_SECRET) {
      const header = req.headers.get('x-livekit-webhook-secret') || req.headers.get('x-livekit-secret') || '';
      if (!header || header !== WEBHOOK_SECRET) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
      }
    }

  const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const { filepath, downloadUrl } = await extractRecordingInfo(payload);

    // Prefer downloadUrl (signed URL) when available
    const recordingUrl = downloadUrl || filepath || null;
    const interviewId = parseInterviewIdFromPath(filepath) || (payload.roomName ? String(payload.roomName) : null);

    if (!interviewId) {
      // We couldn't determine interview id; return 400 so caller can retry with more info
      return NextResponse.json({ error: 'missing interview id in webhook payload', filepath, recordingUrl }, { status: 400 });
    }

    // Upsert into interviews table using server-side Supabase helper
    try {
      const { supabase } = await import('@/lib/supabaseClient');
      const update: Record<string, unknown> = {};
      if (recordingUrl) {
        // store in both audio and video fields — client will choose which to render
        update.audio_signed_url = recordingUrl;
        update.video_signed_url = recordingUrl;
      }
      if (filepath) update.audio_path = filepath;

      const { data, error } = await supabase.from('interviews').upsert({ id: interviewId, ...update }, { onConflict: 'id' }).select().single();
      if (error) {
        console.error('webhook upsert supabase error', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
      }

      return NextResponse.json({ ok: true, row: data });
    } catch (_e) {
        console.error('webhook handler error', _e);
        return NextResponse.json({ error: 'webhook handler error' }, { status: 500 });
      }
  } catch (err) {
    console.error('egress webhook error', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
