"use client";

import React from "react";
import { getHistory, deleteInterview, clearHistory, InterviewRecord, getPendingUploads } from "../../lib/history";
import ClientFormattedDate from "../../components/ClientFormattedDate";
import { useAuth } from "../../lib/useAuth";

export default function HistoryPage() {
  // enforce auth
  useAuth();
  const [list, setList] = React.useState<InterviewRecord[]>([]);
  const [pending, setPending] = React.useState<Array<{ id: string; ts: number }>>([]);
  const [remoteInfo, setRemoteInfo] = React.useState<Record<string, { audioUrl?: string; videoUrl?: string }>>({});

  React.useEffect(() => setList(getHistory()), []);

  // fetch server-side metadata for saved interviews (audio URL, analysis)
  const { session } = useAuth();
  React.useEffect(() => {
    let mounted = true;
    async function loadRemote() {
      const items = getHistory();
  const map: Record<string, { audioUrl?: string; videoUrl?: string }> = {};
      await Promise.all(items.map(async (it) => {
        try {
          const headers: Record<string,string> = { 'Content-Type': 'application/json' };
          if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
          const res = await fetch('/api/interviews/get', { method: 'POST', body: JSON.stringify({ id: it.id }), headers });
          if (!res.ok) return;
          const json = await res.json();
          const data = json.data || {};
          const audio = data.audio_signed_url || null;
          const video = data.video_signed_url || null;
          if (audio || video) map[it.id] = { audioUrl: audio || undefined, videoUrl: video || undefined };
        } catch {
          // ignore
        }
      }));
      if (mounted) setRemoteInfo(map);
    }
    void loadRemote();
    return () => { mounted = false; };
  }, [session]);

  React.useEffect(() => {
    let mounted = true;
    const load = async () => {
      const p = await getPendingUploads();
      if (mounted) setPending(p);
    };
    load();
    const id = window.setInterval(load, 5000);
    return () => { mounted = false; clearInterval(id); };
  }, []);
  const pendingIds = React.useMemo(() => new Set(pending.map((p) => p.id)), [pending]);

  function handleDelete(id: string) {
    deleteInterview(id);
    setList(getHistory());
  }

  function handleExport() {
    const data = JSON.stringify(list, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "interview-history.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleClear() {
    clearHistory();
    setList([]);
  }

  return (
    <div className="bg-surface rounded-2xl shadow-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">History</h2>
        <div className="flex gap-2">
          <button onClick={handleExport} className="px-3 py-1 border-surface-2 rounded">Export</button>
          <button onClick={handleClear} className="px-3 py-1 bg-danger text-foreground rounded">Clear</button>
        </div>
      </div>

      {list.length ? (
        <>
        <div className="mb-4">
          {pending.length > 0 ? (
            <div className="mb-3">
              <div className="font-medium mb-1">Uploading</div>
              <ul className="space-y-2">
                {pending.map((p) => (
                  <li key={p.id} className="flex items-center justify-between p-2 border-surface-2 rounded bg-surface-2">
                    <div>
                      <div className="font-medium">Pending upload</div>
                      <div className="text-xs muted">{new Date(p.ts).toLocaleString()}</div>
                    </div>
                    <div className="text-sm text-foreground">Uploading…</div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <ul className="space-y-3">
          {list.map((r) => (
            <li key={r.id} className="flex items-center justify-between p-3 border-surface-2 rounded">
              <div>
                <div className="font-medium">{r.name}</div>
                <div className="text-sm muted"><ClientFormattedDate iso={r.date} /></div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-sm text-foreground">{r.score ? `${r.score}/100` : pendingIds.has(r.id) ? 'Uploading…' : '—'}</div>
                {remoteInfo[r.id]?.videoUrl ? (
                  <a href={remoteInfo[r.id].videoUrl} target="_blank" rel="noreferrer" className="px-2 py-1 text-sm border-surface-2 rounded text-accent">Recording</a>
                ) : remoteInfo[r.id]?.audioUrl ? (
                  <a href={remoteInfo[r.id].audioUrl} target="_blank" rel="noreferrer" className="px-2 py-1 text-sm border-surface-2 rounded text-accent">Recording</a>
                ) : null}
                <button onClick={() => window.location.href = `/interviews/${r.id}`} disabled={pendingIds.has(r.id)} className="px-2 py-1 text-sm border-surface-2 rounded">View</button>
                <button onClick={() => handleDelete(r.id)} className="px-2 py-1 text-sm border-surface-2 rounded">Delete</button>
              </div>
            </li>
          ))}
        </ul>
        </>
      ) : (
        <div className="text-sm muted">No saved interviews.</div>
      )}
    </div>
  );
}
