import { NextRequest, NextResponse } from 'next/server';
import { getSubscription } from '@/lib/paddleBilling';

export async function GET(_req: NextRequest, context: unknown) {
  try {
    const params = (context as any)?.params ?? null;
    const id = params?.id ?? null;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    if (!process.env.PADDLE_BILLING_API_KEY && !process.env.PADDLE_API_KEY) {
      return NextResponse.json({ error: 'Paddle Billing not configured' }, { status: 400 });
    }

    const sub = await getSubscription(id);
    return NextResponse.json({ subscription: sub });
  } catch (err: unknown) {
    const msg = (err as any)?.message ?? String(err);
    console.error('Get subscription error', msg);
    return NextResponse.json({ error: String(msg) }, { status: 500 });
  }
}
