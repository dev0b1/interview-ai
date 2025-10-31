import { NextRequest, NextResponse } from 'next/server';
import { cancelSubscription } from '@/lib/paddleBilling';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const subscriptionId = body?.subscriptionId;
    const effectiveFrom = body?.effectiveFrom;
    if (!subscriptionId) return NextResponse.json({ error: 'subscriptionId required' }, { status: 400 });

    if (!process.env.PADDLE_BILLING_API_KEY && !process.env.PADDLE_API_KEY) {
      return NextResponse.json({ error: 'Paddle Billing not configured' }, { status: 400 });
    }

    const res = await cancelSubscription(subscriptionId, { effectiveFrom });
    return NextResponse.json({ success: true, res });
  } catch (err: unknown) {
    const msg = (err as any)?.message ?? String(err);
    console.error('Cancel subscription error', msg);
    return NextResponse.json({ error: String(msg) }, { status: 500 });
  }
}
