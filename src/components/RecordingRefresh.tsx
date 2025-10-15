"use client";

import React from 'react';
import { useAuth } from '../lib/useAuth';

export default function RecordingRefresh({ interviewId, roomName = 'interview-room' }: { interviewId: string; roomName?: string }) {
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [msg, setMsg] = React.useState<string | null>(null);
  const { session } = useAuth();

  const doRefresh = async () => {
    setStatus('loading');
    setMsg(null);
    try {
      const headers: Record<string,string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      const res = await fetch('/api/livekit/egress/list', {
        method: 'POST',
        headers,
        body: JSON.stringify({ roomName, interviewId }),
      });
      const j = await res.json();
      if (res.ok && j.ok) {
        setStatus('done');
        setMsg(String(j.recordingUrl || 'recording saved'));
        // reload to pick up persisted audio URL
        setTimeout(() => window.location.reload(), 800);
        return;
      }
      setStatus('error');
      setMsg(j.message || j.error || 'no recording yet');
    } catch (e: any) {
      setStatus('error');
      setMsg(e?.message || String(e));
    }
  };

  return (
    <div className="mt-2">
      <button onClick={doRefresh} disabled={status === 'loading'} className="px-3 py-1 border rounded mr-2">
        {status === 'loading' ? 'Checking…' : 'Refresh recording'}
      </button>
      {msg ? <span className={`text-sm ${status === 'error' ? 'text-rose-600' : 'text-sky-600'}`}>{msg}</span> : null}
    </div>
  );
}
