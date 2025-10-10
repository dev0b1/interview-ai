import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

const OPENROUTER_URL = process.env.OPENROUTER_API_BASE || 'https://openrouter.ai/api/v1';

export async function POST(req: NextRequest) {
  try {
  const body = await req.json();
  const interviewId = typeof body === 'object' && body !== null && 'interviewId' in body ? String((body as Record<string, unknown>).interviewId) : undefined;

    // Fetch interview object from Supabase table 'interviews' (expects columns: id, transcript)
    const { data: rows, error } = await supabase.from('interviews').select('id, transcript').eq('id', interviewId).limit(1);
    if (error) throw error;
    if (!rows || !rows[0]) return NextResponse.json({ error: 'Interview not found' }, { status: 404 });

  const transcriptRaw = rows[0].transcript;
  const transcript = typeof transcriptRaw === 'string' ? JSON.parse(transcriptRaw) : (transcriptRaw as unknown) || [];

  const conversationText = (transcript as Array<Record<string, unknown>>).map((t) => `${String((t.speaker as unknown) ?? 'speaker')}: ${String((t.text as unknown) ?? '')}`).join('\n');

    // Build OpenRouter chat request
    const systemPrompt = `You are an expert interview coach analyzing a job interview transcript.\n\nProvide a comprehensive analysis in JSON format with:\n1. Overall scores (0-100) for:\n   - Communication clarity\n   - Technical knowledge\n   - Confidence & composure\n   - Professionalism\n2. Detailed feedback on:\n   - Strengths (3-5 points)\n   - Areas for improvement (3-5 points)\n   - Filler words usage (um, uh, like, you know)\n   - Response quality (concise vs rambling)\n   - Technical accuracy\n3. Key moments (timestamps of strong/weak answers)\n4. Overall recommendation\n\nBe constructive, specific, and actionable.`;

    const payload = {
      model: 'anthropic/claude-3.5-sonnet',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Analyze this interview transcript:\n\n${conversationText}` },
      ],
      response_format: { type: 'json_object' },
    };

    const res = await fetch(`${OPENROUTER_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`OpenRouter error: ${res.status} ${txt}`);
    }
    const jr = await res.json();
    const content = jr?.choices?.[0]?.message?.content;
    const analysisData = content ? JSON.parse(content) : {};

    // Calculate additional metrics from transcript locally
    function calculateMetrics(transcriptArr: Array<Record<string, unknown>>) {
      const candidateMessages = transcriptArr.filter((t) => String(t.speaker) === 'candidate');
      const fillerWords = ['um', 'uh', 'like', 'you know', 'kind of', 'sort of'];
      let fillerCount = 0;
      candidateMessages.forEach((msg) => {
        const text = String(msg.text ?? '').toLowerCase();
        fillerWords.forEach((filler) => {
          const regex = new RegExp(`\\b${filler}\\b`, 'g');
          fillerCount += (text.match(regex) || []).length;
        });
      });
      const avgResponseLength = Math.round((candidateMessages.reduce((sum, msg) => sum + (String(msg.text ?? '').split(' ').length), 0) || 0) / (candidateMessages.length || 1));
      const pauses: Array<Record<string, unknown>> = [];
      for (let i = 1; i < candidateMessages.length; i++) {
        const prev = new Date(String(candidateMessages[i - 1].ts ?? Date.now()));
        const curr = new Date(String(candidateMessages[i].ts ?? Date.now()));
        const gap = (curr.getTime() - prev.getTime()) / 1000;
        if (gap > 5) pauses.push({ duration: gap, timestamp: curr.toISOString() });
      }
      return {
        fillerWordCount: fillerCount,
        fillerWordRate: (fillerCount / Math.max(1, candidateMessages.length)).toFixed(2),
        avgResponseLength,
        longPauses: pauses,
        totalResponses: candidateMessages.length,
        avgConfidence: (candidateMessages.filter((m) => m.confidence !== undefined).reduce((s, m) => s + Number(m.confidence ?? 0), 0) / Math.max(1, candidateMessages.length)),
      };
    }

    const metrics = calculateMetrics(transcript);

    // return analysis
    return NextResponse.json({ analysis: analysisData, metrics });
  } catch (err: unknown) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
