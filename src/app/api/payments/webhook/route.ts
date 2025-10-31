import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabaseClient';

const asRecord = (x: unknown): Record<string, unknown> | null => (x && typeof x === 'object') ? x as Record<string, unknown> : null;

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
  } catch {
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

    let event: unknown;
    try {
      event = JSON.parse(raw) as unknown;
    } catch {
      console.warn('Failed to parse Paddle Billing webhook JSON');
      return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
    }

    const evt = asRecord(event) ?? {};
    const type = String(evt['event_type'] ?? evt['type'] ?? 'unknown');
    const data = asRecord(evt['data']) ?? evt; // Billing wraps payload in data

    // Persist raw event for auditing (best-effort)
    try {
      await supabase.from('payments').insert({ id: evt['id'] ?? undefined, provider: 'paddle_billing', raw: evt, status: type });
    } catch {
      // ignore persistence errors
    }

    // Persist event to subscription_events for history (if possible)
    try {
      const evId = evt['id'] ?? evt['event_id'] ?? `${type}-${Date.now()}`;
      const dRec = asRecord(data) ?? {};
      const subId = dRec['subscription'] && typeof dRec['subscription'] === 'object' ? ((dRec['subscription'] as Record<string, unknown>)['id']) : (dRec['subscription_id'] ?? dRec['subscriptionId'] ?? dRec['subscription'] ?? null);
      const custom = asRecord(dRec['custom_data']);
      const txCustom = (dRec['transaction'] && typeof dRec['transaction'] === 'object') ? asRecord((dRec['transaction'] as Record<string, unknown>)['custom_data']) : undefined;
      const userId = (custom && (custom['userId'] ?? custom['user_id'] ?? custom['user'])) ?? (txCustom && (txCustom['userId'] ?? txCustom['user_id'])) ?? null;
      await supabase.from('subscription_events').insert({ id: String(evId), subscription_id: subId || undefined, user_id: userId || undefined, event_type: type, event_time: new Date().toISOString(), payload: evt });
    } catch {
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
  const dRec = asRecord(data) ?? {};
  const txRec = (dRec['transaction'] && typeof dRec['transaction'] === 'object') ? asRecord(dRec['transaction']) ?? {} : dRec;
  const txId = String(txRec['id'] ?? txRec['transaction_id'] ?? txRec['id'] ?? '');
  const amount = Number(txRec['amount'] ?? txRec['gross'] ?? txRec['total'] ?? 0);
  const currency = String(txRec['currency'] ?? txRec['currency_code'] ?? '');
  const custom = asRecord(txRec['custom_data']) ?? {};
  const customerObj = asRecord(txRec['customer']) ?? {};
  const userId = custom['userId'] ?? custom['user_id'] ?? custom['user'] ?? customerObj['id'] ?? txRec['customer_id'] ?? undefined;

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
          await supabase.from('payments').upsert({ id: txId || undefined, user_id: userId || undefined, raw: JSON.stringify(evt), status: type, amount, currency }, { returning: 'minimal' });
        } catch {}

        // If transaction is for a subscription or a Pro price, handle profile/subscription
        try {
          const items = Array.isArray(txRec['items']) ? txRec['items'] : (txRec['line_items'] ?? []);
          const first = items && (Array.isArray(items) ? items[0] as Record<string, unknown> : null);
          const priceId = first ? (first['priceId'] ?? first['price_id'] ?? first['product_id']) : undefined;
          const PRO_PRODUCT_ID = process.env.NEXT_PUBLIC_PRO_PRODUCT_ID || '';
          const PRO_PRICE = process.env.NEXT_PUBLIC_PRO_PRICE || '';
          const isPro = (PRO_PRODUCT_ID && priceId && priceId === PRO_PRODUCT_ID) || (PRO_PRICE && String(amount) && String(amount) === PRO_PRICE);

          // If subscription info present, upsert subscriptions
          const subscription = txRec['subscription'] ?? txRec['subscription_id'] ?? txRec['subscriptionId'] ?? (txRec['subscription'] && (txRec['subscription'] as Record<string, unknown>)['id']) ?? null;
          if (subscription || txRec['is_subscription'] || txRec['subscription_id']) {
            const subId = String(subscription ?? txRec['subscription_id'] ?? txRec['subscriptionId'] ?? ((txRec['subscription'] && (txRec['subscription'] as Record<string, unknown>)['id']) ?? '') ?? '');
            const nextBillRaw = txRec['next_billed_at'] ?? txRec['next_payment_date'] ?? ((txRec['subscription'] && (txRec['subscription'] as Record<string, unknown>)['current_billing_period'] && ((txRec['subscription'] as Record<string, unknown>)['current_billing_period'] as Record<string, unknown>)['ends_at']) ?? null) ?? null;
            const nextBill = nextBillRaw ? String(nextBillRaw) : null;
            const subRow: any = {
              id: subId || undefined,
              user_id: userId || undefined,
              provider: 'paddle_billing',
              subscription_id: subId || undefined,
              product_id: priceId ?? undefined,
              status: 'active',
              raw: JSON.stringify(evt),
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
            const expiresAt = computeExpiryFrom(txRec['next_billed_at'] ? String(txRec['next_billed_at']) : null);
            try { await supabase.from('profiles').update({ pro: true, pro_expires_at: expiresAt }).eq('id', userId).select(); } catch {
              try { await supabase.from('profiles').upsert({ id: userId, pro: true, pro_expires_at: expiresAt }, { returning: 'minimal' }); } catch {}
            }
          }
        } catch (_e) {
          console.warn('failed to handle transaction pro/subscription mapping', _e);
        }
      } else if (type === 'subscription.created' || type === 'subscription.updated' || type === 'subscription.canceled' || type === 'subscription.deleted') {
        const dRec = asRecord(data) ?? {};
        const subRec = asRecord(dRec['subscription']) ?? dRec;
        const subId = String(subRec['id'] ?? subRec['subscription_id'] ?? subRec['subscriptionId'] ?? '');
        const status = String(subRec['status'] ?? subRec['state'] ?? 'active');
        const custom = asRecord(subRec['custom_data']);
        const userId = custom && (custom['userId'] ?? custom['user_id'] ?? custom['user']) ? (custom['userId'] ?? custom['user_id'] ?? custom['user']) : undefined;
        const nextBillRaw = subRec['next_billed_at'] ?? (subRec['current_billing_period'] && (subRec['current_billing_period'] as Record<string, unknown>)['ends_at']) ?? null;
        const nextBill = nextBillRaw ? String(nextBillRaw) : null;
        const cancelAtRaw = subRec['cancellation_effective_at'] ?? subRec['scheduled_for'] ?? subRec['cancel_at'] ?? null;
        const cancelAt = cancelAtRaw ? String(cancelAtRaw) : null;

        const subRow: any = {
          id: subId || undefined,
          user_id: userId || undefined,
          provider: 'paddle_billing',
          subscription_id: subId || undefined,
          product_id: subRec['price_id'] ?? subRec['plan_id'] ?? subRec['product_id'] ?? undefined,
          status: status,
          raw: JSON.stringify(evt),
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
        const dRec = asRecord(data) ?? {};
        const txRec = (dRec['transaction'] && typeof dRec['transaction'] === 'object') ? asRecord(dRec['transaction']) ?? {} : dRec;
        const txId = String(txRec['id'] ?? txRec['transaction_id'] ?? '');
        const custom = asRecord(txRec['custom_data']) ?? {};
        const customerObj = asRecord(txRec['customer']) ?? {};
        const userId = custom['userId'] ?? custom['user_id'] ?? customerObj['id'] ?? undefined;
        // upsert payment with failed status
        try { await supabase.from('payments').upsert({ id: txId || undefined, user_id: userId || undefined, raw: JSON.stringify(evt), status: type }, { returning: 'minimal' }); } catch {}
        // Optionally mark subscription as past_due
        const subId = String(txRec['subscription_id'] ?? txRec['subscriptionId'] ?? ((txRec['subscription'] && (txRec['subscription'] as Record<string, unknown>)['id']) ?? '') ?? '');
        if (subId) {
          try { await supabase.from('subscriptions').update({ status: 'past_due', raw: JSON.stringify(evt) }).eq('subscription_id', subId); } catch {}
        }
      } else {
        // Unhandled event types are fine; we stored raw event above
      }
    } catch (_e) {
      console.warn('Error processing paddle billing webhook', _e);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
