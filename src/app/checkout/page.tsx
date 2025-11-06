'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Client-side checkout page.
 * - Initializes Paddle (tries @paddle/paddle-js dynamic import first, then CDN fallback)
 * - Opens checkout using either transactionId (`_ptxn`) or a `priceId` query param
 *
 * Notes: keep typing loose for the Paddle SDK object to avoid coupling to a specific SDK shape.
 */
export default function CheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [paddle, setPaddle] = useState<any>(null);

  useEffect(() => {
    let mounted = true;

    async function initPaddle() {
      try {
        // Try dynamic import of the official package (works in environments where it's installed)
        const mod = await import('@paddle/paddle-js');
        if (mod && typeof mod.initializePaddle === 'function') {
          const inst = await (mod as any).initializePaddle({
            environment: process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT as any,
            token: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
            eventCallback: (event: any) => {
              if (event?.name === 'checkout.closed') router.push('/');
            },
          });
          if (mounted && inst) setPaddle(inst);
          return;
        }
      } catch (err) {
        // ignore, fall back to CDN
      }

      // CDN fallback
      try {
        if ((window as any).Paddle) {
          (window as any).Paddle.Setup?.({ vendor: Number(process.env.NEXT_PUBLIC_PADDLE_VENDOR_ID) });
          if (mounted) setPaddle((window as any).Paddle);
          return;
        }

        await new Promise<void>((resolve, reject) => {
          const src = process.env.NEXT_PUBLIC_PADDLE_JS_URL || 'https://cdn.paddle.com/paddle/paddle.js';
          const s = document.createElement('script');
          s.src = src;
          s.async = true;
          s.onload = () => resolve();
          s.onerror = (e) => reject(e);
          document.head.appendChild(s);
        });

        // Wait a tick for global to exist
        const p = (window as any).Paddle;
        p?.Setup?.({ vendor: Number(process.env.NEXT_PUBLIC_PADDLE_VENDOR_ID) });
        if (mounted) setPaddle(p);
      } catch (err) {
        console.error('[Checkout] Failed to initialize Paddle', err);
      }
    }

    initPaddle();
    return () => { mounted = false; };
  }, [router]);

  useEffect(() => {
    if (!paddle) return;

    const transactionId = searchParams.get('_ptxn');
    if (transactionId) {
      try {
        (paddle as any).Checkout.open({
          settings: { allowLogout: false },
          transactionId,
        });
      } catch (err) {
        console.error('[Checkout] failed to open by transactionId', err);
      }
      return;
    }

    const priceId = searchParams.get('priceId');
    if (priceId) {
      try {
        (paddle as any).Checkout.open({
          settings: { allowLogout: false },
          items: [{ priceId: String(priceId), quantity: 1 }],
          // customer/customData can be provided here if available
        });
      } catch (err) {
        console.error('[Checkout] failed to open by priceId', err);
      }
      return;
    }

    // nothing to open — go home
    router.push('/');
  }, [paddle, searchParams, router]);

  return <p>Preparing checkout...</p>;
}