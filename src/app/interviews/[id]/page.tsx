import React from 'react';
import ShareControls from '@/components/ShareControls';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };
type TranscriptItem = { speaker?: string; ts?: string | number; text?: string };

export default async function InterviewDetail({ params }: Params) {
  const id = params.id;
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/interviews/get`, { method: 'POST', body: JSON.stringify({ id }) });
  const json = await res.json();
  const data = json.data || {} as Record<string, unknown>;
  const transcript = typeof data.transcript === 'string' ? JSON.parse(String(data.transcript)) : (data.transcript as TranscriptItem[]) || [];
  const analysis = typeof data.analysis === 'string' ? JSON.parse(String(data.analysis)) : (data.analysis as Record<string, unknown>) || {};
  const audioUrl = (data && (data as Record<string, unknown>).audio_signed_url) ? (data as Record<string, unknown>).audio_signed_url as string : null;

  // derive simple metrics from transcript
  const fillerWords = ['um','uh','like','you know','actually','so','right'];
  let fillerCount = 0;
  const speakerMap: Record<string, { lines: number; words: number; text: string[] }> = {};
  const timestamps: number[] = [];
  transcript.forEach((t: TranscriptItem) => {
    const text = String(t.text || '');
    const lower = text.toLowerCase();
    fillerWords.forEach((f) => { fillerCount += (lower.split(f).length - 1); });
    const who = String(t.speaker || 'Unknown');
    const words = text.split(/\s+/).filter(Boolean).length;
    if (!speakerMap[who]) speakerMap[who] = { lines: 0, words: 0, text: [] };
    speakerMap[who].lines += 1;
    speakerMap[who].words += words;
    speakerMap[who].text.push(text);
    if (t.ts) {
      const n = Number(t.ts);
      if (!Number.isNaN(n)) timestamps.push(n);
    }
  });

  // detect pauses: look for gaps > 2000ms between transcript timestamps
  timestamps.sort((a,b) => a-b);
  let pauseCount = 0;
  for (let i = 1; i < timestamps.length; i++) {
    if (timestamps[i] - timestamps[i-1] > 2000) pauseCount++;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-2">Interview {id}</h1>
      <h2 className="text-lg font-semibold">Metrics</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="p-3 bg-gray-50 rounded">
          <div className="text-sm text-gray-500">Filler words</div>
          <div className="text-2xl font-bold">{fillerCount}</div>
        </div>
        <div className="p-3 bg-gray-50 rounded">
          <div className="text-sm text-gray-500">Pauses (&gt;2s)</div>
          <div className="text-2xl font-bold">{pauseCount}</div>
        </div>
        <div className="p-3 bg-gray-50 rounded">
          <div className="text-sm text-gray-500">Speakers</div>
          <div className="text-2xl font-bold">{Object.keys(speakerMap).length}</div>
        </div>
      </div>
      <pre className="bg-gray-100 p-3 rounded">{JSON.stringify((analysis.metrics as unknown) ?? analysis, null, 2)}</pre>
      <h2 className="text-lg font-semibold mt-4">AI Feedback</h2>
      <pre className="bg-gray-50 p-3 rounded">{String((analysis.ai_feedback as unknown) || (analysis.feedback as unknown) || '')}</pre>
      <h2 className="text-lg font-semibold mt-4">Transcript</h2>
      {audioUrl ? (
        <div className="mt-3 mb-4">
          <audio controls src={audioUrl} className="w-full" />
          <div className="mt-2 flex items-center justify-between">
            <a className="text-sm text-sky-600" href={audioUrl} target="_blank" rel="noreferrer">Download audio</a>
            <ShareControls audioUrl={audioUrl} />
          </div>
        </div>
      ) : null}
      <div className="space-y-2 mt-2">
        {transcript.map((t: TranscriptItem, i: number) => (
          <div key={i} className="p-2 border rounded">
            <div className="text-sm text-gray-500">{t.speaker} • {t.ts}</div>
            <div>{t.text}</div>
          </div>
        ))}
      </div>
      <div className="mt-6">
        <h2 className="text-lg font-semibold">Speaker segments</h2>
        <div className="mt-2 space-y-2">
          {Object.keys(speakerMap).map((s) => (
            <div key={s} className="p-2 border rounded">
              <div className="font-medium">{s}</div>
              <div className="text-sm text-gray-500">Lines: {speakerMap[s].lines} • Words: {speakerMap[s].words}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
