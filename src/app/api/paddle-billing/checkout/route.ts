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
      env: process.env.PADDLE_ENVIRONMENT,
      headers: Object.fromEntries(req.headers.entries())
    });

    // Require Paddle API key
    if (!process.env.PADDLE_API_KEY) {
      return NextResponse.json({ error: 'Paddle API key not configured' }, { status: 400 });
    }

    // Include success URL for redirect-based checkout flows
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `https://${req.headers.get('host')}`;
    const successUrl = `${baseUrl}/settings?payment=success`;

    // Accept priceId from request, or fall back to public env vars (these must be set in your deployment)
    const effectivePriceId = (priceId as string) || process.env.NEXT_PUBLIC_PRO_PRODUCT_ID || process.env.NEXT_PUBLIC_PADDLE_PRODUCT_ID;
    if (!effectivePriceId || String(effectivePriceId).trim() === '') {
      console.error('[PaddleBilling] Missing priceId - cannot create checkout', { priceId, envFallbacks: { NEXT_PUBLIC_PRO_PRODUCT_ID: process.env.NEXT_PUBLIC_PRO_PRODUCT_ID, NEXT_PUBLIC_PADDLE_PRODUCT_ID: process.env.NEXT_PUBLIC_PADDLE_PRODUCT_ID } });
      return NextResponse.json({ error: 'priceId not provided. Ensure NEXT_PUBLIC_PRO_PRODUCT_ID or NEXT_PUBLIC_PADDLE_PRODUCT_ID is configured.' }, { status: 400 });
    }

    const payload: Record<string, unknown> = {
      items: [{ priceId: effectivePriceId, quantity: 1 }],
      customerEmail: customerEmail || undefined,
      customerId: customerId || undefined,
      customData: customData || undefined,
      success_url: successUrl,
    };

    const tx = await createTransaction(payload);
    console.log('[PaddleBilling] createTransaction result', { tx });
    
    // Extract transaction ID and checkout URL from response (handle different shapes)
    const transactionId = tx?.id ?? tx?.transaction?.id;
    const checkoutUrl = tx?.checkoutUrl ?? tx?.checkout_url ?? tx?.transaction?.checkoutUrl ?? tx?.transaction?.checkout_url;
    
    // Require transactionId for a valid checkout
    if (!transactionId) {
      console.error('[PaddleBilling] No transaction ID in Paddle response', { tx });
      return NextResponse.json(
        { error: 'Checkout configuration error: missing transaction ID from Paddle.' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ transactionId, checkoutUrl });
    } catch (err: unknown) {
      const msg = (err as any)?.message ?? String(err);
      const raw = (err as any)?.raw ?? null;
      
      // Log error and include raw Paddle response when debugging
      console.error('Paddle Billing checkout error', { message: msg, raw });
      if (process.env.PADDLE_DEBUG === 'true') {
        return NextResponse.json({ error: String(msg), raw }, { status: 500 });
      }
      return NextResponse.json({ error: String(msg) }, { status: 500 });
    }
}
