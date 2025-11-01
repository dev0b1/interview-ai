"use client";

import React, { useEffect, useState } from 'react';
import useAuth from '@/lib/useAuth';

type Profile = {
  id: string;
  display_name?: string | null;
  email?: string | null;
  is_admin?: boolean | null;
  created_at?: string | null;        // ✅ added to fix "p.created_at" error
  interview_count?: number | null;   // ✅ added to fix "(p as any).interview_count"
};

type Interview = {
  id: string;
  created_at?: string | null;
  status?: string | null;
};

export default function AdminClient() {
  const { session } = useAuth();
  function getAccessToken(sess: unknown): string | null {
    if (!sess || typeof sess !== 'object') return null;
    const s = sess as Record<string, unknown>;
    // Supabase client may expose token at access_token or in a nested data.session.access_token
    const direct = s['access_token'] ?? s['accessToken'];
    if (typeof direct === 'string' && direct) return direct;
    const data = s['data'] as Record<string, unknown> | undefined;
    const nested = data?.['session'] && (data?.['session'] as Record<string, unknown>)['access_token'];
    if (typeof nested === 'string' && nested) return nested;
    return null;
  }
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [query, setQuery] = useState('');
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // keep the UI minimal: require manual refresh to load profiles
  }, []);

  async function loadProfiles(q?: string) {
    setError(null);
    setLoading(true);
    try {
      const headers: Record<string, string> = {};
      const token = getAccessToken(session);
      if (token) headers['authorization'] = `Bearer ${token}`;
      const url = '/api/admin/users' + (q ? `?q=${encodeURIComponent(q)}` : '');
      const res = await fetch(url, { headers, credentials: 'same-origin' });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'failed');
      setProfiles(j.profiles || []);
    } catch (e: unknown) {
      setError(String((e as Error)?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function loadInterviews(userId: string) {
    setError(null);
    setLoading(true);
    try {
      const headers: Record<string, string> = {};
      const token2 = getAccessToken(session);
      if (token2) headers['authorization'] = `Bearer ${token2}`;
      const res = await fetch(`/api/admin/interviews?user_id=${encodeURIComponent(userId)}`, {
        headers,
        credentials: 'same-origin',
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'failed');
      setInterviews(j.interviews || []);
    } catch (e: unknown) {
      setError(String((e as Error)?.message || e));
    } finally {
      setLoading(false);
    }
  }

  // lightweight stats
  const [stats, setStats] = useState<{
    totalUsers?: number;
    totalInterviews?: number;
    totalRevenue?: number;
    last5?: Array<{ id: string; owner?: string; created_at?: string }>;
  }>({});

  useEffect(() => {
    // load minimal stats when the client mounts
    (async () => {
      try {
                        const headers: Record<string, string> = {};
                        const token3 = getAccessToken(session);
                        if (token3) headers['authorization'] = `Bearer ${token3}`;
        const res = await fetch('/api/admin/stats', { headers, credentials: 'same-origin' });
        if (!res.ok) return;
        const j = await res.json();
        setStats(j || {});
      } catch {
        // ignore stats errors silently
      }
    })();
  }, [session]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Admin (Basic)</h1>

      <div className="mb-4 grid grid-cols-3 gap-4">
        <div className="p-3 bg-surface-2 rounded">
          <div className="text-sm muted">Total users</div>
          <div className="text-xl font-medium text-foreground">{(stats.totalUsers || profiles.length) ?? '—'}</div>
        </div>
        <div className="p-3 bg-surface-2 rounded">
          <div className="text-sm muted">Total interviews</div>
          <div className="text-xl font-medium text-foreground">{stats.totalInterviews ?? '—'}</div>
        </div>
        <div className="p-3 bg-surface-2 rounded">
          <div className="text-sm muted">Total revenue</div>
          <div className="text-xl font-medium text-foreground">
            {typeof stats.totalRevenue === 'number' ? `$${stats.totalRevenue.toFixed(2)}` : '—'}
          </div>
          <div className="text-xs muted mt-2">
            Last 5 interviews:{' '}
            {(stats.last5 || [])
              .map((i) => `${i.owner || i.id} · ${i.created_at ? new Date(i.created_at).toLocaleString() : ''}`)
              .join(' · ') || '—'}
          </div>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search email or name"
          className="px-2 py-1 border border-surface-2 rounded bg-transparent text-foreground"
        />
  <button onClick={() => loadProfiles(query)} className="px-3 py-1 bg-accent text-foreground rounded">
          Search
        </button>
        <button
          onClick={() => {
            setQuery('');
            loadProfiles();
          }}
          className="px-3 py-1 bg-surface-2 text-foreground rounded"
        >
          Clear
        </button>
      </div>

  {error && <div className="text-danger mb-4">{error}</div>}

      <section className="mb-6">
        <h2 className="font-semibold">Profiles</h2>
        {loading ? (
          <div>Loading...</div>
        ) : (
          <ul>
            {profiles.map((p) => (
              <li key={p.id} className="py-1 flex items-center justify-between">
                <div>
                  <span className="font-medium text-foreground">{p.display_name || p.email || p.id}</span>
                  {p.is_admin && (
                    <span className="ml-2 text-xs bg-success/20 text-success px-2 py-0.5 rounded">ADMIN</span>
                  )}
                  <div className="text-xs muted">
                    {p.email} · {p.created_at ? new Date(p.created_at).toLocaleDateString() : ''}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-sm muted">Interviews: {p.interview_count ?? 0}</div>
                  <button className="text-sm text-accent" onClick={() => loadInterviews(p.id)}>
                    Show interviews
                  </button>
                  {!p.is_admin && (
                    <button
                      className="text-sm text-foreground bg-accent px-2 py-1 rounded"
                      onClick={async () => {
                        setError(null);
                        setLoading(true);
                        try {
                          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                          if (session && (session as any).access_token)
                            headers['authorization'] = `Bearer ${(session as any).access_token}`;
                          const res = await fetch('/api/admin/promote', {
                            method: 'POST',
                            headers,
                            body: JSON.stringify({ userId: p.id }),
                          });
                          const j = await res.json();
                          if (!res.ok) throw new Error(j?.error || 'failed to promote');
                          // update local state to mark user as admin
                          setProfiles((prev) =>
                            prev.map((x) => (x.id === p.id ? { ...x, is_admin: true } : x))
                          );
                        } catch (e: unknown) {
                          setError(String((e as Error)?.message || e));
                        } finally {
                          setLoading(false);
                        }
                      }}
                    >
                      Promote
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-semibold">Interviews</h2>
        {interviews.length === 0 ? (
          <div className="text-sm muted">No interviews loaded</div>
        ) : (
          <ul>
            {interviews.map((iv) => (
              <li key={iv.id} className="py-1">
                {iv.id} — {iv.status} — {iv.created_at ? new Date(iv.created_at).toLocaleString() : ''}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
