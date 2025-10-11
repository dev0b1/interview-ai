"use client";

import React from "react";
import { useAuth } from "../../lib/useAuth";
import type { SupabaseClient } from '@supabase/supabase-js';
import dynamic from 'next/dynamic';

const PaddleCheckoutButton = dynamic(() => import('@/components/PaddleCheckoutButton'), { ssr: false });

export default function SettingsPage() {
  // enforce auth
  const _auth = useAuth();
  const { signOut } = _auth;
  const [dark, setDark] = React.useState(false);
  const [isPro, setIsPro] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  // fetch profile info (credits + pro flag)
  type ProfileRow = { credits?: number | null; pro?: boolean | null };
  const fetchProfile = React.useCallback(async () => {
    try {
      const s = await _auth.supabase?.auth.getUser();
      const user = (s as unknown as { data?: { user?: { id?: string } } })?.data?.user;
      if (!user?.id) {
        setIsPro(null);
        return;
      }
      const { data, error } = await _auth.supabase!.from('profiles').select('credits, pro').eq('id', user.id).limit(1).maybeSingle();
      if (!error && data) {
        setIsPro(Boolean((data as unknown as ProfileRow).pro));
      } else {
        setIsPro(false);
      }
    } catch {
      setIsPro(false);
    }
  }, [_auth]);

  React.useEffect(() => { fetchProfile(); }, [fetchProfile]);

  // If we arrived from a payment return_url, poll until profile shows Pro
  React.useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    if (qs.get('payment') !== 'success') return;
    let cancelled = false;
    const start = Date.now();
    const poll = async () => {
      if (cancelled) return;
      await fetchProfile();
      if (isPro === true) {
        // done
        // remove query param to avoid repeated polling
        const u = new URL(window.location.href);
        u.searchParams.delete('payment');
        window.history.replaceState({}, '', u.toString());
        return;
      }
      if (Date.now() - start > 30000) return; // give up after 30s
      setTimeout(poll, 2500);
    };
    poll();
    return () => { cancelled = true; };
  }, [fetchProfile, isPro]);

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 space-y-4">
      <h2 className="text-xl font-semibold">Settings</h2>

      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">Dark theme</div>
          <div className="text-sm text-gray-500">Toggle the app theme</div>
        </div>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} />
          <span className="text-sm">{dark ? "On" : "Off"}</span>
        </label>
      </div>

      <div>
        <div className="font-medium">Audio device</div>
        <div className="text-sm text-gray-500">Select microphone and speaker (coming soon)</div>
      </div>

      <div className="pt-4">
        <div className="space-y-4">
          <div className="bg-gray-50 p-4 rounded">
            <h3 className="font-medium">Buy Credits</h3>
            <p className="text-sm text-gray-500">Buy interview credits to unlock paid features.</p>
            <div className="mt-2">
              <div className="flex items-center gap-3">
                <button
                  className="px-4 py-2 bg-sky-600 text-white rounded"
                  onClick={async () => {
                    try {
                      const productId = process.env.NEXT_PUBLIC_PADDLE_PRODUCT_ID || 'demo-product';
                      let passthrough: string | undefined = undefined;
                      try {
                        const s = await _auth.supabase?.auth.getUser();
                        const user = (s as unknown as { data?: { user?: { id?: string } } })?.data?.user;
                        if (user?.id) passthrough = user.id;
                      } catch {
                        // ignore
                      }
                      const res = await fetch('/api/payments/create', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amount: '10.00', currency: 'USD', product_id: productId, passthrough }) });
                      const j = await res.json();
                      if (j.checkout_url) window.location.href = j.checkout_url; else alert('Failed to create checkout');
                    } catch (err) {
                      console.error(err);
                      alert('Payment initiation failed');
                    }
                  }}
                >
                  Buy $10 Credits
                </button>

                {/* Upgrade to Pro button */}
                {/* Use Paddle.js v2 overlay when available via PaddleCheckoutButton */}
                <PaddleCheckoutButton priceId={process.env.NEXT_PUBLIC_PRO_PRODUCT_ID || ''}>
                  {isPro === true ? 'Pro — Active' : 'Upgrade to Pro'}
                </PaddleCheckoutButton>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded">
            <h3 className="font-medium">Payment History</h3>
            <PaymentHistory supabase={_auth.supabase ?? null} />
          </div>

          <div>
            <button
              className="px-4 py-2 bg-red-600 text-white rounded"
              onClick={async () => {
                try {
                  await signOut();
                  // send the user to the auth page after sign out
                  window.location.href = '/auth';
                } catch (err) {
                  console.error('Sign out failed', err);
                  alert('Sign out failed');
                }
              }}
            >
              Sign out
            </button>
          </div>
        </div>
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
      if (j.payments) setPayments(j.payments as PaymentItem[]);
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
          <div>{p.created_at ?? '—'}</div>
          <div className="text-right">{p.amount ? `$${p.amount}` : '—'} {p.currency}</div>
        </li>
      ))}
    </ul>
  );
}
