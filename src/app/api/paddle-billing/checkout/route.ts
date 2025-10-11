/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createTransaction } from '@/lib/paddleBilling';

export async function POST(req: NextRequest) {
  try {
    const { priceId, customerEmail, customerId, customData } = await req.json();

    // Feature-flag: require billing API key
    if (!process.env.PADDLE_BILLING_API_KEY && !process.env.PADDLE_API_KEY) {
      return NextResponse.json({ error: 'Paddle Billing not configured' }, { status: 400 });
    }

    const base = process.env.NEXT_PUBLIC_BASE_URL || '';
    const payload: any = {
      items: [{ priceId, quantity: 1 }],
      customerEmail: customerEmail || undefined,
      customerId: customerId || undefined,
      customData: customData || undefined,
      checkoutSettings: { successUrl: `${base.replace(/\/$/, '')}/settings?payment=success` },
    };

    const tx = await createTransaction(payload);
    // SDK may return different shapes; try to provide common keys
    return NextResponse.json({ transactionId: tx?.id ?? tx?.transaction?.id, checkoutUrl: tx?.checkoutUrl ?? tx?.transaction?.checkoutUrl ?? tx?.checkout_url });
  } catch (err: any) {
    console.error('Paddle Billing checkout error', err?.message || err);
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
