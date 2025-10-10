"use client";

import React from "react";
import { getHistory, InterviewRecord } from "../../lib/history";
import type { SupabaseClient } from '@supabase/supabase-js';
import ClientFormattedDate from "../../components/ClientFormattedDate";
import { useAuth } from "../../lib/useAuth";

// (auth enforcement is handled inside the component)

function smallBarChart(data: number[]) {
  const max = Math.max(...data, 1);
  return (
    <svg viewBox={`0 0 ${data.length * 20} 40`} className="w-full h-14">
      {data.map((v, i) => {
        const h = (v / max) * 30;
        return <rect key={i} x={i * 20 + 4} y={36 - h} width={12} height={h} rx={3} className="fill-sky-400" />;
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
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h2 className="text-xl font-semibold mb-2">Dashboard</h2>
        <p className="text-sm text-gray-600 mb-4">Quick overview of recent interviews.</p>

        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 bg-gray-50 rounded">
            <div className="text-sm text-gray-500">Total Interviews</div>
            <div className="text-2xl font-bold">{history.length}</div>
          </div>
          <div className="p-4 bg-gray-50 rounded">
            <div className="text-sm text-gray-500">Recent (last 7 days)</div>
            <div className="text-2xl font-bold">{counts.reduce((a, b) => a + b, 0)}</div>
          </div>
          <div className="p-4 bg-gray-50 rounded">
            <div className="text-sm text-gray-500">Average Score</div>
            <div className="text-2xl font-bold">{history.length ? Math.round((history.reduce((s, r) => s + (r.score || 0), 0) / history.length)) : "—"}</div>
          </div>
        </div>

        <div className="mt-6">{smallBarChart(counts)}</div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h3 className="text-lg font-semibold mb-3">Credits</h3>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-500">Your available credits</div>
          <div className="text-2xl font-bold">{credits === null ? '—' : credits}</div>
          <button
            className="px-3 py-1 bg-gray-100 rounded text-sm"
            onClick={() => fetchCredits()}
          >
            Refresh
          </button>
        </div>
        <div className="mt-3 text-sm text-gray-500">Credits are granted automatically after successful payments.</div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h3 className="text-lg font-semibold mb-3">Billing</h3>
        <p className="text-sm text-gray-500 mb-4">Buy interview credits to unlock paid features.</p>
        <div>
          <button
            className="px-4 py-2 bg-sky-600 text-white rounded"
            onClick={async () => {
              try {
                // include passthrough user id if available
                const productId = process.env.NEXT_PUBLIC_PADDLE_PRODUCT_ID || 'demo-product';
                let passthrough: string | undefined = undefined;
                if (supabase) {
                  try {
                    const s = await supabase.auth.getUser();
                    const user = (s as unknown as { data?: { user?: { id?: string } } })?.data?.user;
                    if (user?.id) passthrough = user.id;
                  } catch {
                    // ignore
                  }
                }

                const res = await fetch('/api/payments/create', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ amount: '10.00', currency: 'USD', product_id: productId, passthrough }),
                });
                const j = await res.json();
                if (j.checkout_url) {
                  window.location.href = j.checkout_url;
                } else {
                  alert('Failed to create checkout');
                }
              } catch (err) {
                console.error(err);
                alert('Payment initiation failed');
              }
            }}
          >
            Buy $10 Credits
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h3 className="text-lg font-semibold mb-3">Payment History</h3>
  <PaymentHistory supabase={supabase} />
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h3 className="text-lg font-semibold mb-3">Recent Interviews</h3>
        {recent.length ? (
          <ul className="space-y-3">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-sm text-gray-500"><ClientFormattedDate iso={r.date} /></div>
                </div>
                <div className="text-sm text-gray-700">{r.score ? `${r.score}/100` : "—"}</div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-gray-500">No interviews yet.</div>
        )}
      </div>
    </div>
  );
}

function PaymentHistory({ supabase }: { supabase: SupabaseClient | null }) {
  type PaymentItem = { id: string; amount?: number; currency?: string; created_at?: string };
  const [payments, setPayments] = React.useState<PaymentItem[]>([]);

  const fetchPayments = React.useCallback(async () => {
    if (!supabase) return;
    try {
      const s = await supabase.auth.getSession();
      const token = (s as unknown as { data?: { session?: { access_token?: string } } })?.data?.session?.access_token;
      if (!token) return;
      const res = await fetch('/api/payments/list', { headers: { Authorization: `Bearer ${token}` } });
      const j = await res.json();
      if (j.payments) setPayments(j.payments as Array<{ id: string; amount?: number; currency?: string; created_at?: string }>);
    } catch {
      // ignore
    }
  }, [supabase]);

  React.useEffect(() => { fetchPayments(); }, [fetchPayments]);

  if (!payments.length) return <div className="text-sm text-gray-500">No payments yet.</div>;

  return (
    <ul className="space-y-2 text-sm">
      {payments.map((p) => (
        <li key={p.id} className="flex justify-between">
          <div>{p.created_at ? <ClientFormattedDate iso={p.created_at} /> : '—'}</div>
          <div className="text-right">{p.amount ? `$${p.amount}` : '—'} {p.currency}</div>
        </li>
      ))}
    </ul>
  );
}
