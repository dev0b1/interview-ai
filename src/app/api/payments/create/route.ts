import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { createTransaction } from '@/lib/paddleBilling';

// Small UUIDv4 generator (crypto-backed when available)
function uuidv4(): string {
  try {
  const b = crypto.getRandomValues(new Uint8Array(16));
  // RFC4122 variant/time_hi_and_version adjustments
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
    const s = Array.from(b).map((n: number) => n.toString(16).padStart(2, '0')).join('');
    return `${s.substr(0,8)}-${s.substr(8,4)}-${s.substr(12,4)}-${s.substr(16,4)}-${s.substr(20,12)}`;
  } catch {
    // fallback to Math.random (not cryptographically strong)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}

type CreateBody = { amount?: string; currency?: string; product_id?: string };

// keep explicit any allowed in this file for the minimal UUID helper

export async function POST(req: NextRequest) {
  try {
    const { amount = '10.00', currency = 'USD', product_id = '' } = (await req.json()) as CreateBody;

    // Authenticate the user via Bearer token and create a server-side checkout session
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.replace('Bearer ', '').trim() : authHeader.trim();
    let userId: string | undefined = undefined;
    if (token) {
      const { data: userData } = await supabase.auth.getUser(token);
      if (userData?.user?.id) userId = userData.user.id;
    }

    // Create a local checkout session id
    const sessionId = uuidv4();
    try {
      await supabase.from('checkout_sessions').upsert({ id: sessionId, user_id: userId, product_id, amount: parseFloat(amount) || null, currency, status: 'created' });
    } catch {
      // ignore DB write errors; we can still proceed
    }

    // Prefer Paddle Billing (modern) if API key is present
    const billingKey = process.env.PADDLE_BILLING_API_KEY || process.env.PADDLE_API_KEY || '';

    // Prefer passing the authenticated user id as passthrough so webhooks can map directly
    const passthrough = userId || sessionId; // userId if available, otherwise session id

    if (billingKey && product_id) {
      try {
        const base = process.env.NEXT_PUBLIC_BASE_URL || '';
        const payload: Record<string, unknown> = {
          items: [{ priceId: product_id, quantity: 1 }],
          customData: { userId: passthrough },
          checkoutSettings: { successUrl: `${base.replace(/\/$/, '')}/settings?payment=success` },
        };
  // SDK expects any; disable the lint rule for this third-party call
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tx = await createTransaction(payload as any);
        // tx shape depends on SDK; attempt to return common fields
        const transactionId = tx?.id ?? tx?.transaction?.id ?? tx?.data?.id;
        const checkoutUrl = tx?.checkoutUrl ?? tx?.transaction?.checkoutUrl ?? tx?.data?.checkout_url ?? tx?.data?.checkoutUrl;
        return NextResponse.json({ transactionId, checkoutUrl });
      } catch (err) {
        console.warn('Paddle Billing create transaction failed', err);
        // fallthrough to classic fallback
      }
    }

    // Fallback demo URL (non-authoritative)
    const demoUrl = `https://vendors.paddle.com/checkout/${encodeURIComponent(product_id || 'demo') }?amount=${encodeURIComponent(amount)}&currency=${encodeURIComponent(currency)}&passthrough=${encodeURIComponent(passthrough)}`;
    return NextResponse.json({ checkout_url: demoUrl });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
