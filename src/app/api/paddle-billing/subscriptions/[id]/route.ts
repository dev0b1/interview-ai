/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getSubscription } from '@/lib/paddleBilling';

export async function GET(_req: NextRequest, context: any) {
  try {
    const params = await (context?.params ?? context?.params);
    const id = params?.id ?? (context?.params && (await context.params))?.id;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    if (!process.env.PADDLE_BILLING_API_KEY && !process.env.PADDLE_API_KEY) {
      return NextResponse.json({ error: 'Paddle Billing not configured' }, { status: 400 });
    }

    const sub = await getSubscription(id);
    return NextResponse.json({ subscription: sub });
  } catch (err: any) {
    console.error('Get subscription error', err?.message || err);
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
