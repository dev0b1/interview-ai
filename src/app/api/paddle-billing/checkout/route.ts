import { NextRequest, NextResponse } from 'next/server';
import { createTransaction } from '@/lib/paddleBilling';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const priceId = body?.priceId;
    const customerEmail = body?.customerEmail;
    const customerId = body?.customerId;
    const customData = body?.customData;

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
    // SDK may return different shapes; try to provide common keys
    const transactionId = tx && (tx as any).id ? (tx as any).id : (tx && (tx as any).transaction ? (tx as any).transaction.id : undefined);
    const checkoutUrl = tx && (tx as any).checkoutUrl ? (tx as any).checkoutUrl : (tx && (tx as any).transaction ? (tx as any).transaction.checkoutUrl ?? (tx as any).transaction.checkout_url : (tx as any).checkout_url);
    return NextResponse.json({ transactionId, checkoutUrl });
  } catch (err: unknown) {
    const msg = (err as any)?.message ?? String(err);
    console.error('Paddle Billing checkout error', msg);
    return NextResponse.json({ error: String(msg) }, { status: 500 });
  }
}
