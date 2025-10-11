/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React from 'react';

interface Props {
  priceId: string;
  onSuccess?: () => void;
  children?: React.ReactNode;
}

declare global {
  interface Window { Paddle?: any; }
}

export default function PaddleCheckoutButton({ priceId, onSuccess, children }: Props) {
  const [paddle, setPaddle] = React.useState<any | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    // If Paddle is already loaded, use it; otherwise inject the CDN script.
    const init = () => {
      try {
        const p = (window as any).Paddle;
        if (p && mounted) setPaddle(p);
      } catch (err) {
        console.warn('Paddle init error', err);
      }
    };

    if ((window as any).Paddle) {
      init();
      return () => { mounted = false; };
    }

    const script = document.createElement('script');
    script.src = process.env.NEXT_PUBLIC_PADDLE_JS_URL || 'https://cdn.paddle.com/paddle/paddle.js';
    script.async = true;
    script.onload = () => {
      // Some Paddle builds require initialization with vendor id
      try {
        const vendor = process.env.NEXT_PUBLIC_PADDLE_VENDOR_ID;
        if (vendor && (window as any).Paddle && (window as any).Paddle.Setup) {
          try { (window as any).Paddle.Setup({ vendor: Number(vendor) }); } catch {}
        }
      } catch {}
      init();
    };
    script.onerror = () => { console.warn('Failed to load Paddle script'); };
    document.body.appendChild(script);
    return () => { mounted = false; };
  }, []);

  const handleClick = async () => {
    setLoading(true);
    try {
      // create transaction on server
      const res = await fetch('/api/payments/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ product_id: priceId }),
      });
      const j = await res.json();
      const transactionId = j.transactionId ?? j.transaction?.id;
      const checkoutUrl = j.checkoutUrl ?? j.checkout_url;

      if (paddle && transactionId && typeof paddle.Checkout?.open === 'function') {
        try {
          paddle.Checkout.open({ transactionId, onComplete: () => { onSuccess?.(); window.location.href = '/settings?payment=success'; } });
          return;
        } catch (err) {
          console.warn('Paddle overlay open failed', err);
        }
      }

      if (checkoutUrl) {
        window.location.href = checkoutUrl;
        return;
      }

      alert('Failed to start checkout');
    } catch (err) {
      console.error('Checkout failed', err);
      alert('Checkout failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={handleClick} disabled={loading} className="px-4 py-2 bg-emerald-600 text-white rounded">
      {children ?? (loading ? 'Loading…' : 'Upgrade to Pro')}
    </button>
  );
}
