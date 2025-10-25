import { NextResponse } from 'next/server';
import { RoomServiceClient } from 'livekit-server-sdk';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const roomName = String(body.roomName || '');
    const interviewId = String(body.interviewId || '');
    const format = String(body.format || 'mp4');

    if (!roomName || !interviewId) {
      return NextResponse.json({ error: 'missing roomName or interviewId' }, { status: 400 });
    }

    const livekitUrl = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL;
    const livekitKey = process.env.LIVEKIT_API_KEY;
    const livekitSecret = process.env.LIVEKIT_API_SECRET;

    if (!livekitUrl || !livekitKey || !livekitSecret) {
      return NextResponse.json({ error: 'livekit not configured' }, { status: 500 });
    }

  type SvcStart = { startEgress?: (req: Record<string, unknown>) => Promise<Record<string, unknown>> };
  const svc = new RoomServiceClient(livekitUrl, livekitKey, livekitSecret) as unknown as SvcStart;
    if (typeof svc.startEgress !== 'function') {
      return NextResponse.json({ error: 'startEgress not available on RoomServiceClient' }, { status: 501 });
    }

    // Construct a file path / object using interviewId for easier mapping
    const filepath = `interviews/${interviewId}.${format}`;

    // Attempt to start egress; exact result shape depends on the SDK/runtime
    const req = {
      roomName,
      file: { filepath },
    };

  const res = await svc.startEgress(req as Record<string, unknown>);

    return NextResponse.json({ ok: true, result: res });
  } catch (err) {
    console.error('egress start error', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
