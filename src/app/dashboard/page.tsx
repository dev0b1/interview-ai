"use client";

import React from "react";
import { getHistory, InterviewRecord } from "../../lib/history";
// supabase client type was previously imported but is not used in this file
import ClientFormattedDate from "../../components/ClientFormattedDate";
import { useAuth } from "../../lib/useAuth";

// (auth enforcement is handled inside the component)

function smallBarChart(data: number[]) {
  const max = Math.max(...data, 1);
  return (
    <svg viewBox={`0 0 ${data.length * 20} 40`} className="w-full h-14">
      {data.map((v, i) => {
        const h = (v / max) * 30;
  return <rect key={i} x={i * 20 + 4} y={36 - h} width={12} height={h} rx={3} className="fill-accent" />;
      })}
    </svg>
  );
}

export default function DashboardPage() {
  // enforce auth (keeps previous behavior for immediate redirect checks)
  const _auth = useAuth();
  const [history, setHistory] = React.useState<InterviewRecord[]>([]);
  const [credits, setCredits] = React.useState<number | null>(null);

  const { supabase } = _auth;

  const fetchCredits = React.useCallback(async () => {
    if (!supabase) return;
    try {
      const userRes = await supabase.auth.getUser();
      const user = (userRes as unknown as { data?: { user?: { id?: string } } })?.data?.user;
      if (!user?.id) {
        setCredits(null);
        return;
      }
      const { data, error } = await supabase.from('users').select('credits').eq('id', user.id).limit(1).single();
      if (!error && data) {
        setCredits(Number((data as unknown as { credits?: number }).credits ?? 0));
      }
    } catch {
      // ignore; keep credits as null
    }
  }, [supabase]);

  React.useEffect(() => {
    setHistory(getHistory());
  }, []);

  React.useEffect(() => {
    // fetch credits once on mount
    fetchCredits();
  }, [fetchCredits]);

  const recent = history.slice(0, 5);
  // simple counts by day (last 7 days)
  const counts = new Array(7).fill(0);
  const today = new Date();
  history.forEach((h) => {
    const d = new Date(h.date);
    const diff = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diff >= 0 && diff < 7) counts[6 - diff]++;
  });

  return (
    <div className="space-y-6">
      <div className="bg-surface rounded-2xl shadow-lg p-6">
        <h2 className="text-xl font-semibold mb-2">Dashboard</h2>
        <p className="text-sm muted mb-4">Quick overview of recent interviews.</p>

        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 bg-surface-2 rounded">
            <div className="text-sm muted">Total Interviews</div>
            <div className="text-2xl font-bold">{history.length}</div>
          </div>
          <div className="p-4 bg-surface-2 rounded">
            <div className="text-sm muted">Recent (last 7 days)</div>
            <div className="text-2xl font-bold">{counts.reduce((a, b) => a + b, 0)}</div>
          </div>
          <div className="p-4 bg-surface-2 rounded">
            <div className="text-sm muted">Average Score</div>
            <div className="text-2xl font-bold">{history.length ? Math.round((history.reduce((s, r) => s + (r.score || 0), 0) / history.length)) : "—"}</div>
          </div>
        </div>

        <div className="mt-6">{smallBarChart(counts)}</div>
      </div>
      <div className="bg-surface rounded-2xl shadow-lg p-6">
        <h3 className="text-lg font-semibold mb-3">Credits</h3>
        <div className="flex items-center gap-4">
          <div className="text-sm muted">Your available credits</div>
          <div className="text-2xl font-bold">{credits === null ? '—' : credits}</div>
          <button
            className="px-3 py-1 bg-surface-2 rounded text-sm"
            onClick={() => fetchCredits()}
          >
            Refresh
          </button>
        </div>
        <div className="mt-3 text-sm muted">Credits are granted automatically after successful payments.</div>
      </div>
      <div className="bg-surface rounded-2xl shadow-lg p-6">
        <h3 className="text-lg font-semibold mb-3">Post-interview analysis</h3>
        <p className="text-sm muted mb-4">Quick metrics from your recent interviews.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-surface-2 rounded">
            <div className="text-sm muted">Avg. Score</div>
            <div className="text-2xl font-bold">{history.length ? Math.round((history.reduce((s, r) => s + (r.score || 0), 0) / history.length)) : '—'}</div>
          </div>
          <div className="p-4 bg-surface-2 rounded">
            <div className="text-sm muted">Avg. Duration</div>
            <div className="text-2xl font-bold">{history.length ? `${Math.round((history.reduce((s, r) => s + (r.durationSec || 0), 0) / history.length) / 60)}m` : '—'}</div>
          </div>
          <div className="p-4 bg-surface-2 rounded">
            <div className="text-sm muted">Filler words</div>
            <div className="text-2xl font-bold">{(function(){
              const fillers = ['um','uh','like','you know','actually'];
              let count = 0;
              history.forEach(h => { if (h.notes) {
                const txt = h.notes.toLowerCase();
                fillers.forEach(f => { count += (txt.split(f).length - 1); });
              }});
              return count;
            })()}</div>
          </div>
        </div>
        <div className="mt-4 text-sm muted">Click an interview in Recent Interviews for a detailed report.</div>
      </div>
      <div className="bg-surface rounded-2xl shadow-lg p-6">
        <h3 className="text-lg font-semibold mb-3">Recent Interviews</h3>
        {recent.length ? (
          <ul className="space-y-3">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-sm muted"><ClientFormattedDate iso={r.date} /></div>
                </div>
                <div className="text-sm text-foreground">{r.score ? `${r.score}/100` : "—"}</div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm muted">No interviews yet.</div>
        )}
      </div>
    </div>
  );
}

