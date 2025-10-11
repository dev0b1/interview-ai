/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { cancelSubscription } from '@/lib/paddleBilling';

export async function POST(req: NextRequest) {
  try {
    const { subscriptionId, effectiveFrom } = await req.json();
    if (!subscriptionId) return NextResponse.json({ error: 'subscriptionId required' }, { status: 400 });

    if (!process.env.PADDLE_BILLING_API_KEY && !process.env.PADDLE_API_KEY) {
      return NextResponse.json({ error: 'Paddle Billing not configured' }, { status: 400 });
    }

    const res = await cancelSubscription(subscriptionId, { effectiveFrom });
    return NextResponse.json({ success: true, res });
  } catch (err: any) {
    console.error('Cancel subscription error', err?.message || err);
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
