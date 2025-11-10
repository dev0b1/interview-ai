"use client";

import React from "react";
import { useAuth } from "../../lib/useAuth";
import type { SupabaseClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import Toast from '@/components/Toast';

export default function SettingsPage() {
  const auth = useAuth();
  const { signOut } = auth;
  const router = useRouter();
  const [dark, setDark] = React.useState(false);
  const [isPro, setIsPro] = React.useState<boolean | null>(null);
  const [credits, setCredits] = React.useState<number | null>(null);
  const [userId, setUserId] = React.useState<string | undefined>(undefined);
  const [toastMsg, setToastMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  type ProfileRow = { credits?: number | null; pro?: boolean | null };
  const fetchProfile = React.useCallback(async () => {
    try {
      const s = await auth.supabase?.auth.getUser();
      const user = (s as unknown as { data?: { user?: { id?: string } } })?.data?.user;
      if (!user?.id) {
        setIsPro(null);
        return;
      }
      setUserId(user.id);
      const { data, error } = await auth.supabase!.from('profiles').select('credits, pro, pro_expires_at').eq('id', user.id).limit(1).maybeSingle();
      if (!error && data) {
        const pro = Boolean((data as unknown as ProfileRow).pro);
        const expires = (data as any).pro_expires_at;
        const isActive = pro && (!expires || new Date(expires) > new Date());
        setIsPro(isActive);
        setCredits(Number((data as unknown as ProfileRow).credits ?? 0));
      } else {
        setIsPro(false);
        setCredits(0);
      }
    } catch {
      setIsPro(false);
    }
  }, [auth]);

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
        // show toast and finish
        setToastMsg('Payment successful — your account is now Pro');
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
    <div className="bg-surface rounded-2xl shadow-lg p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Settings</h2>
        <div>
          {isPro === null ? null : isPro ? (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-success/80 to-success text-foreground font-semibold">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l2.39 4.85L19 8.18l-3.5 3.41.83 4.84L12 15.77 7.67 16.03l.83-4.84L4.99 8.18l4.61-.?" fill="currentColor"/></svg>
              <span>Pro</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-accent/20 bg-surface-3 text-foreground">
              <svg className="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2a5 5 0 100 10 5 5 0 000-10z" fill="currentColor"/></svg>
              <div className="flex flex-col leading-none">
                <span className="text-sm font-semibold">Free</span>
                <span className="text-xs text-foreground/60">Limited access</span>
              </div>
            </div>
          )}
            {credits !== null && (
              <div className="inline-flex items-center ml-3 px-2 py-1 rounded-full bg-surface-2 text-sm font-medium">
                <span className="text-foreground/80 mr-2">🎫</span>
                <span className="text-foreground">{credits} credits</span>
              </div>
            )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">Dark theme</div>
          <div className="text-sm muted">Toggle the app theme</div>
        </div>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} />
          <span className="text-sm">{dark ? "On" : "Off"}</span>
        </label>
      </div>

      <div>
        <div className="font-medium">Audio device</div>
        <div className="text-sm muted">Select microphone and speaker (coming soon)</div>
      </div>

      <div className="pt-4">
        <div className="space-y-4">
          <div className="bg-surface-2 p-4 rounded">
            <h3 className="font-medium">Buy Credits</h3>
            <p className="text-sm muted">Buy Hroast credits to unlock paid features.</p>
            <div className="mt-2">
              <div className="flex items-center gap-3">
                <button
                  className="px-4 py-2 bg-accent text-foreground rounded"
                  onClick={() => {
                    const productId = process.env.NEXT_PUBLIC_PADDLE_PRODUCT_ID || process.env.NEXT_PUBLIC_PRO_PRODUCT_ID || 'demo-product';
                    // Navigate to the checkout page which will open the Paddle overlay
                    router.push(`/checkout?priceId=${encodeURIComponent(productId)}`);
                  }}
                >
                  Buy $10 Credits
                </button>

                {/* Upgrade to Pro button — route-based checkout */}
                <button
                  className="px-4 py-2 bg-success text-foreground rounded flex items-center gap-2"
                  onClick={() => {
                    const productId = process.env.NEXT_PUBLIC_PADDLE_PRODUCT_ID || process.env.NEXT_PUBLIC_PRO_PRODUCT_ID || 'demo-product';
                    router.push(`/checkout?priceId=${encodeURIComponent(productId)}`);
                  }}
                >
                  {isPro === true ? 'Pro — Active' : 'Upgrade to Pro'}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-surface-2 p-4 rounded">
            <h3 className="font-medium">Payment History</h3>
            <PaymentHistory supabase={auth.supabase ?? null} />
          </div>

          <div>
            <button
              className="px-4 py-2 bg-danger text-foreground rounded"
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
        {/* toast for payment success */}
        {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
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
      if (j?.payments) setPayments(j.payments as PaymentItem[]);
    } catch (err) {
      // ignore
    }
  }, [supabase]);

  React.useEffect(() => { fetchPayments(); }, [fetchPayments]);

  if (!payments.length) return <div className="text-sm muted">No payments yet.</div>;

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
