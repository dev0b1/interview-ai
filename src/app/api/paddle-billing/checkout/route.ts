import { NextRequest, NextResponse } from 'next/server';
import { createTransaction } from '@/lib/paddleBilling';

export async function POST(req: NextRequest) {
  // Track these at function scope so error handlers can access them
  let baseUrl: string | undefined;
  let successUrl: string | undefined;
  
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
      env: process.env.PADDLE_ENVIRONMENT,
      baseUrl: process.env.NEXT_PUBLIC_BASE_URL,
      headers: Object.fromEntries(req.headers.entries())
    });

    // Require Paddle API key
    if (!process.env.PADDLE_API_KEY) {
      return NextResponse.json({ error: 'Paddle API key not configured' }, { status: 400 });
    }

    // Get base URL from environment or request headers
    baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    if (!baseUrl) {
      const host = req.headers.get('host');
      const protocol = req.headers.get('x-forwarded-proto') || 'https';
      if (host) {
        baseUrl = `${protocol}://${host}`;
      }
    }
    
    console.log('[PaddleBilling] URL Details:', {
      baseUrl,
      host: req.headers.get('host'),
      proto: req.headers.get('x-forwarded-proto'),
      referer: req.headers.get('referer')
    });

    // Build the return URL carefully
    if (baseUrl) {
      try {
        const url = new URL(baseUrl);
        // Ensure we're using https for Paddle
        url.protocol = 'https:';
        // Clean any trailing slashes and add our path
        const cleanBase = url.toString().replace(/\/$/, '');
        successUrl = `${cleanBase}/settings?payment=success`;
        console.log('[PaddleBilling] Using return URL:', successUrl);
      } catch (e) {
        console.warn('[PaddleBilling] Invalid base URL:', baseUrl, e);
      }
    } else {
      console.warn('[PaddleBilling] No base URL available, omitting checkout.url');
    }

    const payload: Record<string, unknown> = {
      items: [{ priceId, quantity: 1 }],
      customerEmail: customerEmail || undefined,
      customerId: customerId || undefined,
      customData: customData || undefined,
      ...(successUrl ? {
        checkoutSettings: { successUrl }
      } : {}),
    };

  const tx = await createTransaction(payload);
  console.log('[PaddleBilling] createTransaction result', { tx });
    // SDK may return different shapes; try to provide common keys
    const transactionId = tx && (tx as any).id ? (tx as any).id : (tx && (tx as any).transaction ? (tx as any).transaction.id : undefined);
    const checkoutUrl = tx && (tx as any).checkoutUrl ? (tx as any).checkoutUrl : (tx && (tx as any).transaction ? (tx as any).transaction.checkoutUrl ?? (tx as any).transaction.checkout_url : (tx as any).checkout_url);
    return NextResponse.json({ transactionId, checkoutUrl });
    } catch (err: unknown) {
      const msg = (err as any)?.message ?? String(err);
      const raw = (err as any)?.raw ?? null;
      
      // Special handling for domain approval errors
      if (msg.includes('checkout.url') && msg.includes('domain')) {
        let domain = 'unknown';
        try {
          if (successUrl) {
            domain = new URL(successUrl).hostname;
          } else if (baseUrl) {
            domain = new URL(baseUrl).hostname;
          }
        } catch {}
        
        console.error('Paddle Billing domain error', {
          message: msg,
          raw,
          domain,
          baseUrl,
          successUrl,
          isSandbox: process.env.PADDLE_ENVIRONMENT === 'sandbox'
        });
        
        return NextResponse.json({
          error: `Domain '${domain}' is not approved in Paddle. Please ensure it's added to the allowed domains in your Paddle Dashboard (Sandbox mode: ${process.env.PADDLE_ENVIRONMENT === 'sandbox'})`,
          raw: process.env.PADDLE_DEBUG === 'true' ? raw : undefined
        }, { status: 400 });
      }
      
      // Log other errors
      console.error('Paddle Billing checkout error', {
        message: msg,
        raw
      });
      
      // If PADDLE_DEBUG is set, include the raw Paddle response for easier debugging
      if (process.env.PADDLE_DEBUG === 'true') {
        return NextResponse.json({ error: String(msg), raw }, { status: 500 });
      }
      return NextResponse.json({ error: String(msg) }, { status: 500 });
    }
}
