import { NextResponse } from 'next/server';
import { RoomServiceClient } from 'livekit-server-sdk';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const egressId = String(body.egressId || '');

    if (!egressId) {
      return NextResponse.json({ error: 'missing egressId' }, { status: 400 });
    }

    const livekitUrl = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL;
    const livekitKey = process.env.LIVEKIT_API_KEY;
    const livekitSecret = process.env.LIVEKIT_API_SECRET;

    if (!livekitUrl || !livekitKey || !livekitSecret) {
      return NextResponse.json({ error: 'livekit not configured' }, { status: 500 });
    }

  type SvcStop = { stopEgress?: (opts: { egressId: string }) => Promise<Record<string, unknown>> };
  const svc = new RoomServiceClient(livekitUrl, livekitKey, livekitSecret) as unknown as SvcStop;
    if (typeof svc.stopEgress !== 'function') {
      return NextResponse.json({ error: 'stopEgress not available on RoomServiceClient' }, { status: 501 });
    }

  const res = await svc.stopEgress({ egressId });
    return NextResponse.json({ ok: true, result: res });
  } catch (err) {
    console.error('egress stop error', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
