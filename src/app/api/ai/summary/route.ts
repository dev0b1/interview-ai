import { NextResponse } from "next/server";

// Summarization endpoint disabled — the LiveKit agent (`backend/agent.py`) is
// the single source of truth for interview summaries and analysis. The agent
// publishes final results in-room via LiveKit data channels (topic:
// `interview_results` or `agent-messages`).

export async function POST() {
  return NextResponse.json(
    { error: 'Server-side summarization disabled. Use the LiveKit agent.' },
    { status: 501 }
  );
}

export async function GET() {
  return NextResponse.json(
    { message: 'POST entries to summarize; summarization is disabled. The LiveKit agent provides analysis.' },
    { status: 501 }
  );
}
