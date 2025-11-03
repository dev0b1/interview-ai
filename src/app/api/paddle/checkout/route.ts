import { NextRequest, NextResponse } from 'next/server';
import { createTransaction } from '@/lib/paddleBilling';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { priceId, customerEmail, userId } = body;

    // Validate required fields
    if (!priceId) {
      return NextResponse.json({ error: 'priceId is required' }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    if (!process.env.PADDLE_BILLING_API_KEY && !process.env.PADDLE_API_KEY) {
      return NextResponse.json({ error: 'Paddle not configured' }, { status: 500 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
    
    const payload = {
      items: [{ priceId, quantity: 1 }],
      customerEmail: customerEmail || undefined,
      customData: { userId }, // Important: pass userId for webhook
      checkoutSettings: {
        successUrl: `${baseUrl.replace(/\/$/, '')}/settings?payment=success`,
      },
    };

    const tx = await createTransaction(payload as any);
    
    const transactionId = (tx as any)?.id || (tx as any)?.transaction?.id;
    const checkoutUrl = (tx as any)?.checkoutUrl || (tx as any)?.checkout_url || (tx as any)?.transaction?.checkout_url || (tx as any)?.transaction?.checkoutUrl;

    if (!checkoutUrl) {
      throw new Error('Failed to create checkout URL');
    }

    return NextResponse.json({ transactionId, checkoutUrl });
  } catch (err: any) {
    console.error('Paddle checkout error:', err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? 'Checkout failed' }, { status: 500 });
  }
}
