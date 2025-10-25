import { NextResponse } from 'next/server';

// Server-side analysis has been disabled to avoid duplicate/conflicting analysis.
// The LiveKit agent (backend/agent.py) performs the canonical analysis and
// publishes results in-room via LiveKit data channels. If you need offline
// analysis of recordings, implement a separate offline worker that consumes
// stored transcripts or an agent-backed HTTP proxy.

export async function POST() {
  return NextResponse.json({ error: 'Server-side analysis disabled. Use LiveKit agent.' }, { status: 501 });
}
