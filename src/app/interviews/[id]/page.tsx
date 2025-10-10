import React from 'react';

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

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-2">Interview {id}</h1>
      <h2 className="text-lg font-semibold">Metrics</h2>
      <pre className="bg-gray-100 p-3 rounded">{JSON.stringify((analysis.metrics as unknown) ?? analysis, null, 2)}</pre>
      <h2 className="text-lg font-semibold mt-4">AI Feedback</h2>
      <pre className="bg-gray-50 p-3 rounded">{String((analysis.ai_feedback as unknown) || (analysis.feedback as unknown) || '')}</pre>
      <h2 className="text-lg font-semibold mt-4">Transcript</h2>
      <div className="space-y-2 mt-2">
        {transcript.map((t: TranscriptItem, i: number) => (
          <div key={i} className="p-2 border rounded">
            <div className="text-sm text-gray-500">{t.speaker} • {t.ts}</div>
            <div>{t.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
