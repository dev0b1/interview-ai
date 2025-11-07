import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

// Shared secret expected from the agent to authorize upserts
const SECRET = process.env.AGENT_UPSERT_SECRET || '';

export async function POST(req: NextRequest) {
  try {
    const headerSecret = req.headers.get('x-agent-secret') || '';
    if (!SECRET || headerSecret !== SECRET) {
      // Log mismatch for debugging but avoid printing full secrets
      const mask = (s: string) => s ? `${String(s).slice(0, 4)}...` : '<empty>';
      if (!SECRET) console.warn('AGENT_UPSERT_SECRET is not configured on server. Rejecting upsert request.');
      else console.warn(`Unauthorized upsert attempt: agent secret mismatch. header=${mask(headerSecret)} serverSecret=${mask(SECRET)}`);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { interviewId, analysis, ai_feedback, internal_metrics, audio_path, audio_signed_url, transcript, video_signed_url } = body;
    if (!interviewId) return NextResponse.json({ error: 'missing interviewId' }, { status: 400 });

    // Normalize fields into JSON strings where appropriate
    const update: Record<string, unknown> = {};
    // If ai_feedback is present but analysis is not structured to include it, merge into analysis
    let mergedAnalysis: unknown = analysis;
    try {
      const parsed = typeof analysis === 'string' ? JSON.parse(String(analysis)) : analysis;
      if (parsed && typeof parsed === 'object') {
        mergedAnalysis = { ...(parsed as Record<string, unknown>), ai_feedback: ai_feedback ?? (parsed as Record<string, unknown>)['ai_feedback'] };
      } else if (ai_feedback !== undefined) {
        mergedAnalysis = { ai_feedback };
      }
    } catch {
      // couldn't parse analysis; if ai_feedback present, create a simple analysis object
      if (analysis === undefined && ai_feedback !== undefined) mergedAnalysis = { ai_feedback };
      else mergedAnalysis = analysis;
    }
    if (mergedAnalysis !== undefined) update.analysis = typeof mergedAnalysis === 'string' ? mergedAnalysis : JSON.stringify(mergedAnalysis);
    if (ai_feedback !== undefined) update.ai_feedback = ai_feedback;
    if (internal_metrics !== undefined) update.internal_metrics = typeof internal_metrics === 'string' ? internal_metrics : JSON.stringify(internal_metrics);
    if (audio_path !== undefined) update.audio_path = audio_path;
    if (audio_signed_url !== undefined) update.audio_signed_url = audio_signed_url;
    if (transcript !== undefined) update.transcript = typeof transcript === 'string' ? transcript : JSON.stringify(transcript);
    if (video_signed_url !== undefined) update.video_signed_url = video_signed_url;

    const { data, error } = await supabase
      .from('interviews')
      .upsert({ id: interviewId, ...update }, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      console.error('Supabase upsert error', error);
      return NextResponse.json({ error: String(error) }, { status: 500 });
    }

    return NextResponse.json({ ok: true, row: data });
  } catch (err) {
    console.error('upsert-results error', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
