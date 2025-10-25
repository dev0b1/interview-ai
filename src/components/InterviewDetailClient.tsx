"use client";

import React from 'react';
import { useAuth } from '../lib/useAuth';
import ShareControls from '@/components/ShareControls';

type TranscriptItem = { speaker?: string; ts?: string | number; text?: string };

export default function InterviewDetailClient({ id }: { id: string }) {
  const { session } = useAuth();
  const [loading, setLoading] = React.useState(true);
  const [data, setData] = React.useState<unknown>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const headers: Record<string,string> = { 'Content-Type': 'application/json' };
        if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
        const res = await fetch('/api/interviews/get', { method: 'POST', headers, body: JSON.stringify({ id }) });
        if (!res.ok) {
          const j = await res.json().catch(() => null) as unknown;
          let errMsg = `fetch failed ${res.status}`;
          if (j && typeof j === 'object' && 'error' in (j as Record<string, unknown>)) {
            const maybeErr = (j as Record<string, unknown>)['error'];
            errMsg = typeof maybeErr === 'string' ? maybeErr : JSON.stringify(maybeErr);
          }
          throw new Error(errMsg);
        }
        const json = await res.json() as { data?: unknown; error?: unknown };
        if (mounted) setData(json.data || {});
      } catch (e: unknown) {
        if (mounted) setError((e as Error)?.message || String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => { mounted = false; };
  }, [id, session?.access_token]);

  if (loading) return <div className="p-6">Loading…</div>;
  if (error) return <div className="p-6 text-rose-600">Error: {error}</div>;

  const row = (data && typeof data === 'object') ? data as Record<string, unknown> : {} as Record<string, unknown>;
  const transcript = typeof row?.transcript === 'string' ? JSON.parse(String(row.transcript)) : (row?.transcript || []) as TranscriptItem[];
  const analysis = typeof row?.analysis === 'string' ? JSON.parse(String(row.analysis)) : (row?.analysis || {});
  const audioUrl = (row?.audio_signed_url as string) || null;
  const videoUrl = (row?.video_signed_url as string) || null;

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
      {videoUrl ? (
        <div className="mt-3 mb-4">
          <video controls src={videoUrl} className="w-full" />
          <div className="mt-2 flex items-center justify-between">
            <a className="text-sm text-sky-600" href={videoUrl} target="_blank" rel="noreferrer">Download video</a>
            <ShareControls audioUrl={videoUrl} />
          </div>
        </div>
      ) : audioUrl ? (
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
