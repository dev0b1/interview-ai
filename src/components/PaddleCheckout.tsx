"use client";

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export interface User {
  id?: string;
  customerId?: string | null;
  email?: string | null;
}

export interface CheckoutProps {
  user?: User;
}

async function loadPaddleViaCdn(): Promise<any> {
  return new Promise((resolve) => {
    if ((window as any).Paddle) return resolve((window as any).Paddle);
    const script = document.createElement('script');
    script.src = process.env.NEXT_PUBLIC_PADDLE_JS_URL || 'https://cdn.paddle.com/paddle/paddle.js';
    script.async = true;
    script.onload = () => {
      try {
        const vendor = process.env.NEXT_PUBLIC_PADDLE_VENDOR_ID;
        if ((window as any).Paddle && vendor && typeof (window as any).Paddle.Setup === 'function') {
          try { (window as any).Paddle.Setup({ vendor: Number(vendor) }); } catch {}
        }
      } catch {}
      resolve((window as any).Paddle);
    };
    script.onerror = () => resolve(undefined);
    document.body.appendChild(script);
  });
}

export function Checkout({ user }: CheckoutProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [paddle, setPaddle] = useState<any | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        // Prefer package if installed
        let mod: any;
        try {
          // dynamic import may fail if package not installed — fall back to CDN
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          mod = await import('@paddle/paddle-js');
        } catch (e) {
          mod = undefined;
        }

        if (mod && typeof mod.initializePaddle === 'function') {
          const inst = await mod.initializePaddle({
            environment: process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT as any,
            token: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
            eventCallback(event: any) {
              if (!mounted) return;
              switch (event.name) {
                case 'checkout.closed':
                  router.push('/');
                  break;
                default:
              }
            },
          });
          if (mounted) setPaddle(inst as any);
          return;
        }

        // Fallback to CDN global
        const cdnPaddle = await loadPaddleViaCdn();
        if (mounted && cdnPaddle) setPaddle(cdnPaddle);
      } catch (err) {
        // ignore
      }
    };
    init();
    return () => { mounted = false; };
  }, [router]);

  useEffect(() => {
    // transactionId from Paddle redirects
    const transactionId = searchParams.get('_ptxn');

    if (transactionId) {
      try {
        paddle?.Checkout?.open?.({
          settings: { allowLogout: false },
          transactionId,
        });
      } catch (e) {
        // fallback: navigate directly
        window.location.href = `${window.location.origin}?_ptxn=${transactionId}`;
      }
      return;
    }

    const priceId = searchParams.get('priceId');
    if (priceId) {
      try {
        paddle?.Checkout?.open?.({
          settings: { allowLogout: false },
          items: [{ priceId, quantity: 1 }],
          customer: {
            id: user?.customerId,
            email: user?.email,
          },
          customData: { userId: user?.id },
        });
      } catch (e) {
        // fallback to redirect to checkout URL constructed by server if needed
        // We don't construct that URL here — let server handle transactions.
      }
      return;
    }

    // Nothing to do — redirect away
    router.push('/');
  }, [paddle, searchParams, router, user]);

  return <p>Preparing checkout…</p>;
}

export default Checkout;
