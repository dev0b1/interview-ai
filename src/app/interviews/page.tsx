import React from 'react';

// Force dynamic rendering to avoid prerender-time fetch to internal API
export const dynamic = 'force-dynamic';

type InterviewItem = { id: string; status?: string; created_at?: string };

export default async function InterviewsPage() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/interviews/list`);
  const json = await res.json();
  const items = (json.data || []) as InterviewItem[];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Hroasts</h1>
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.id}>
            <a href={`/interviews/${it.id}`} className="text-accent">{it.id}</a> — {it.status} — {it.created_at ? new Date(it.created_at).toLocaleString('en-US') : '—'}
          </li>
        ))}
      </ul>
    </div>
  );
}
