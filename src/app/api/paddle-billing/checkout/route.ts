import { NextRequest, NextResponse } from 'next/server';
import { createTransaction } from '@/lib/paddleBilling';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const priceId = body?.priceId;
    const customerEmail = body?.customerEmail;
    const customerId = body?.customerId;
    const customData = body?.customData;
    
    console.log('[PaddleBilling] Creating checkout', {
      priceId,
      customerEmail,
      customerId,
      customData,
      hasApiKey: !!process.env.PADDLE_BILLING_API_KEY,
      hasLegacyKey: !!process.env.PADDLE_API_KEY,
      env: process.env.PADDLE_ENVIRONMENT
    });

    // Feature-flag: require billing API key
    if (!process.env.PADDLE_BILLING_API_KEY && !process.env.PADDLE_API_KEY) {
      return NextResponse.json({ error: 'Paddle Billing not configured' }, { status: 400 });
    }

    const base = process.env.NEXT_PUBLIC_BASE_URL || '';
    const payload: Record<string, unknown> = {
      items: [{ priceId, quantity: 1 }],
      customerEmail: customerEmail || undefined,
      customerId: customerId || undefined,
      customData: customData || undefined,
      checkoutSettings: { successUrl: `${base.replace(/\/$/, '')}/settings?payment=success` },
    };

  const tx = await createTransaction(payload);
  console.log('[PaddleBilling] createTransaction result', { tx });
    // SDK may return different shapes; try to provide common keys
    const transactionId = tx && (tx as any).id ? (tx as any).id : (tx && (tx as any).transaction ? (tx as any).transaction.id : undefined);
    const checkoutUrl = tx && (tx as any).checkoutUrl ? (tx as any).checkoutUrl : (tx && (tx as any).transaction ? (tx as any).transaction.checkoutUrl ?? (tx as any).transaction.checkout_url : (tx as any).checkout_url);
    return NextResponse.json({ transactionId, checkoutUrl });
  } catch (err: unknown) {
    const msg = (err as any)?.message ?? String(err);
    console.error('Paddle Billing checkout error', msg, { raw: (err as any)?.raw ?? null });
    // If PADDLE_DEBUG is set, include the raw Paddle response for easier debugging
    if (process.env.PADDLE_DEBUG === 'true') {
      return NextResponse.json({ error: String(msg), raw: (err as any)?.raw ?? null }, { status: 500 });
    }
    return NextResponse.json({ error: String(msg) }, { status: 500 });
  }
}
