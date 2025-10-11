/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabaseClient';

// Billing-style webhook: Paddle Billing sends JSON with an HMAC-style 'paddle-signature' header
function verifySignature(raw: string, signatureHeader: string | null) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET || '';
  if (!secret) return false;
  if (!signatureHeader) return false;
  const parts = signatureHeader.split(';').map((s) => s.trim());
  const tsPart = parts.find((p) => p.startsWith('t='));
  const h1Part = parts.find((p) => p.startsWith('h1='));
  if (!tsPart || !h1Part) return false;
  const ts = tsPart.split('=')[1];
  const h1 = h1Part.split('=')[1];
  const signed = `${ts}:${raw}`;
  const expected = crypto.createHmac('sha256', secret).update(signed).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(h1, 'hex'));
  } catch (_) {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    const sig = req.headers.get('paddle-signature');
    // If secret is configured, require valid signature
    if (process.env.PADDLE_WEBHOOK_SECRET) {
      if (!verifySignature(raw, sig)) {
        console.warn('Paddle Billing webhook signature invalid');
        return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 401 });
      }
    }

    let event: any;
    try {
      event = JSON.parse(raw);
    } catch (e) {
      console.warn('Failed to parse Paddle Billing webhook JSON');
      return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
    }

    const type = String(event.event_type ?? event.type ?? 'unknown');
    const data = event.data ?? event; // Billing wraps payload in data

    // Persist raw event for auditing
    try {
      await supabase.from('payments').insert({ id: event.id ?? undefined, provider: 'paddle_billing', raw: event, status: type });
    } catch {
      // ignore persistence errors
    }

    // Persist event to subscription_events for history (if possible)
    try {
      const evId = event.id ?? event.event_id ?? `${type}-${Date.now()}`;
      const subId = data.subscription?.id ?? data.subscription_id ?? data.subscriptionId ?? data.subscription ?? null;
      const userId = (data.custom_data?.userId ?? data.custom_data?.user_id ?? data.custom_data?.user) || (data.transaction?.custom_data?.userId ?? data.transaction?.custom_data?.user_id ?? null) || null;
      await supabase.from('subscription_events').insert({ id: String(evId), subscription_id: subId || undefined, user_id: userId || undefined, event_type: type, event_time: new Date().toISOString(), payload: event });
    } catch (e) {
      // ignore
    }

    // Helper to compute expiry date
    function computeExpiryFrom(nextBill?: string | null) {
      if (nextBill) {
        try { return new Date(String(nextBill)).toISOString(); } catch {}
      }
      const durationDays = Number(process.env.NEXT_PUBLIC_PRO_DURATION_DAYS || '365');
      const d = new Date(); d.setUTCDate(d.getUTCDate() + Math.max(1, durationDays));
      return d.toISOString();
    }

    try {
      if (type === 'transaction.completed' || type === 'transaction.success' || type === 'transaction.created') {
        const tx = data.transaction ?? data;
        const txId = String(tx.id ?? tx.transaction_id ?? tx.id ?? '');
        const amount = Number(tx.amount ?? tx.gross ?? tx.total ?? 0);
        const currency = String(tx.currency ?? tx.currency_code ?? '');
        const custom = tx.custom_data ?? tx.custom_data ?? {};
        const userId = custom?.userId ?? custom?.user_id ?? custom?.user ?? tx.customer?.id ?? tx.customer_id ?? undefined;

        // idempotency: if payment already succeeded, skip
        if (txId) {
          try {
            const { data: existing } = await supabase.from('payments').select('id, status').eq('id', txId).limit(1).maybeSingle();
            if (existing && existing.status === type) {
              return NextResponse.json({ ok: true });
            }
          } catch {}
        }

        // upsert payment
        try {
          await supabase.from('payments').upsert({ id: txId || undefined, user_id: userId || undefined, raw: JSON.stringify(event), status: type, amount, currency }, { returning: 'minimal' });
        } catch {}

        // If transaction is for a subscription or a Pro price, handle profile/subscription
        try {
          const items = Array.isArray(tx.items) ? tx.items : (tx.line_items ?? []);
          const first = items && items.length ? items[0] : null;
          const priceId = first?.priceId ?? first?.price_id ?? first?.product_id ?? undefined;
          const PRO_PRODUCT_ID = process.env.NEXT_PUBLIC_PRO_PRODUCT_ID || '';
          const PRO_PRICE = process.env.NEXT_PUBLIC_PRO_PRICE || '';
          const isPro = (PRO_PRODUCT_ID && priceId && priceId === PRO_PRODUCT_ID) || (PRO_PRICE && String(amount) && String(amount) === PRO_PRICE);

          // If subscription info present, upsert subscriptions
          const subscription = tx.subscription ?? tx.subscription_id ?? tx.subscriptionId ?? tx.subscription?.id ?? null;
          if (subscription || tx.is_subscription || tx.subscription_id) {
            const subId = String(subscription ?? tx.subscription_id ?? tx.subscriptionId ?? (tx.subscription && tx.subscription.id) ?? '');
            const nextBill = tx.next_billed_at ?? tx.next_billed_at ?? tx.next_payment_date ?? (tx.subscription && tx.subscription.current_billing_period?.ends_at) ?? null;
            const subRow: any = {
              id: subId || undefined,
              user_id: userId || undefined,
              provider: 'paddle_billing',
              subscription_id: subId || undefined,
              product_id: priceId ?? undefined,
              status: 'active',
              raw: JSON.stringify(event),
            };
            if (nextBill) {
              try { subRow.next_bill_date = new Date(String(nextBill)).toISOString(); } catch {}
            }
            try { await supabase.from('subscriptions').upsert(subRow, { returning: 'minimal' }); } catch {}

            // mark pro
            if (userId) {
              const expiresAt = computeExpiryFrom(nextBill ?? null);
              try { await supabase.from('profiles').update({ pro: true, pro_expires_at: expiresAt }).eq('id', userId).select(); } catch {
                try { await supabase.from('profiles').upsert({ id: userId, pro: true, pro_expires_at: expiresAt }, { returning: 'minimal' }); } catch {}
              }
            }
          } else if (isPro && userId) {
            const expiresAt = computeExpiryFrom(tx.next_billed_at ?? null);
            try { await supabase.from('profiles').update({ pro: true, pro_expires_at: expiresAt }).eq('id', userId).select(); } catch {
              try { await supabase.from('profiles').upsert({ id: userId, pro: true, pro_expires_at: expiresAt }, { returning: 'minimal' }); } catch {}
            }
          }
        } catch (e) {
          console.warn('failed to handle transaction pro/subscription mapping', e);
        }
      } else if (type === 'subscription.created' || type === 'subscription.updated' || type === 'subscription.canceled' || type === 'subscription.deleted') {
        const sub = data.subscription ?? data;
        const subId = String(sub.id ?? sub.subscription_id ?? sub.subscriptionId ?? '');
        const status = String(sub.status ?? sub.state ?? 'active');
        const userId = sub.custom_data?.userId ?? sub.custom_data?.user_id ?? sub.custom_data?.user ?? undefined;
        const nextBill = sub.next_billed_at ?? sub.current_billing_period?.ends_at ?? null;
        const cancelAt = sub.cancellation_effective_at ?? sub.scheduled_for ?? sub.cancel_at ?? null;

        const subRow: any = {
          id: subId || undefined,
          user_id: userId || undefined,
          provider: 'paddle_billing',
          subscription_id: subId || undefined,
          product_id: sub.price_id ?? sub.plan_id ?? sub.product_id ?? undefined,
          status: status,
          raw: JSON.stringify(event),
        };
        if (nextBill) {
          try { subRow.next_bill_date = new Date(String(nextBill)).toISOString(); } catch {}
        }
        try {
          // attach cancel_at field when present
          if (cancelAt) {
            try { subRow.cancel_at = new Date(String(cancelAt)).toISOString(); } catch {}
          }
          await supabase.from('subscriptions').upsert(subRow, { returning: 'minimal' });
        } catch {}

        // Update profile based on status and cancel_at semantics
        if (userId) {
          if (status === 'active') {
            const expiresAt = computeExpiryFrom(nextBill ?? null);
            try { await supabase.from('profiles').update({ pro: true, pro_expires_at: expiresAt }).eq('id', userId).select(); } catch {
              try { await supabase.from('profiles').upsert({ id: userId, pro: true, pro_expires_at: expiresAt }, { returning: 'minimal' }); } catch {}
            }
          } else if (status === 'cancelled' || status === 'deleted') {
            // If there's a scheduled cancellation date (cancelAt), keep pro until that time
            if (cancelAt) {
              // store cancel_at on subscriptions (done above). Do not revoke pro until cancel_at <= now
              // ensure profile pro remains true and pro_expires_at matches cancelAt
              const expiresAt = computeExpiryFrom(cancelAt);
              try { await supabase.from('profiles').update({ pro: true, pro_expires_at: expiresAt }).eq('id', userId).select(); } catch {
                try { await supabase.from('profiles').upsert({ id: userId, pro: true, pro_expires_at: expiresAt }, { returning: 'minimal' }); } catch {}
              }
            } else {
              // immediate cancellation: revoke pro now
              try { await supabase.from('profiles').update({ pro: false, pro_expires_at: new Date().toISOString() }).eq('id', userId).select(); } catch {
                try { await supabase.from('profiles').upsert({ id: userId, pro: false, pro_expires_at: new Date().toISOString() }, { returning: 'minimal' }); } catch {}
              }
            }
          }
        }
      } else if (type === 'transaction.payment_failed' || type === 'transaction.failed') {
        const tx = data.transaction ?? data;
        const txId = String(tx.id ?? tx.transaction_id ?? '');
        const userId = tx.custom_data?.userId ?? tx.custom_data?.user_id ?? tx.customer?.id ?? undefined;
        // upsert payment with failed status
        try { await supabase.from('payments').upsert({ id: txId || undefined, user_id: userId || undefined, raw: JSON.stringify(event), status: type }, { returning: 'minimal' }); } catch {}
        // Optionally mark subscription as past_due
        const subId = String(tx.subscription_id ?? tx.subscriptionId ?? tx.subscription?.id ?? '');
        if (subId) {
          try { await supabase.from('subscriptions').update({ status: 'past_due', raw: JSON.stringify(event) }).eq('subscription_id', subId); } catch {}
        }
      } else {
        // Unhandled event types are fine; we stored raw event above
      }
    } catch (e) {
      console.warn('Error processing paddle billing webhook', e);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
