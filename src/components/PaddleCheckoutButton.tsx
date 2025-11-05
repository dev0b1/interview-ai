"use client";

import React from 'react';

interface Props {
  priceId?: string;
  onSuccess?: () => void;
  children?: React.ReactNode;
  userId?: string | null;
}

declare global {
  interface Window { Paddle?: any; }
}

export default function PaddleCheckoutButton({ priceId, onSuccess, children, userId }: Props) {
  const [loading, setLoading] = React.useState(false);
  const [showFallback, setShowFallback] = React.useState(false);
  const [fallbackUrl, setFallbackUrl] = React.useState<string | null>(null);
  const [showSuccessToast, setShowSuccessToast] = React.useState(false);

  const loadPaddle = async () => {
    if ((window as any).Paddle) return (window as any).Paddle;
    return new Promise<any>((resolve) => {
      const script = document.createElement('script');
      script.src = process.env.NEXT_PUBLIC_PADDLE_JS_URL || 'https://cdn.paddle.com/paddle/paddle.js';
      script.async = true;
      script.onload = () => {
        try {
          const vendor = process.env.NEXT_PUBLIC_PADDLE_VENDOR_ID;
          if ((window as any).Paddle && vendor && typeof (window as any).Paddle.Setup === 'function') {
            try { (window as any).Paddle.Setup({ vendor: Number(vendor) }); } catch (e) { console.warn('Paddle.Setup failed', e); }
          }
        } catch {}
        resolve((window as any).Paddle);
      };
      script.onerror = () => resolve(undefined);
      document.body.appendChild(script);
    });
  };

  const handleClick = async () => {
    setLoading(true);
    const effectivePriceId = priceId || process.env.NEXT_PUBLIC_PRO_PRODUCT_ID || process.env.NEXT_PUBLIC_PADDLE_PRODUCT_ID;
    const normalizedPriceId = effectivePriceId == null ? '' : String(effectivePriceId).trim();
    if (!normalizedPriceId || normalizedPriceId === 'undefined') {
      console.error('[PaddleCheckout] Missing priceId, aborting checkout', { priceId, envFallbacks: { NEXT_PUBLIC_PRO_PRODUCT_ID: process.env.NEXT_PUBLIC_PRO_PRODUCT_ID, NEXT_PUBLIC_PADDLE_PRODUCT_ID: process.env.NEXT_PUBLIC_PADDLE_PRODUCT_ID } });
      alert('Payment configuration error: price ID is missing. Please contact support.');
      setLoading(false);
      return;
    }

    try {
      const p = await loadPaddle();
      if (!p || !p.Checkout || typeof p.Checkout.open !== 'function') {
        console.error('[PaddleCheckout] Paddle JS not available or missing Checkout.open');
        alert('Payment initialization failed (Paddle not available)');
        setLoading(false);
        return;
      }

      console.log('[PaddleCheckout] Opening overlay with priceId', { effectivePriceId: normalizedPriceId, userId });
      p.Checkout.open({
        items: [{ priceId: normalizedPriceId, quantity: 1 }],
        settings: { displayMode: 'overlay', locale: 'en' },
        customer: userId ? { id: userId } : undefined,
        customData: { userId: userId } as any,
        onComplete: () => {
          onSuccess?.();
          setShowSuccessToast(true);
          setTimeout(() => setShowSuccessToast(false), 3500);
        },
        onClose: () => {},
      });
    } catch (err) {
      console.error('Overlay open failed', err);
      alert('Failed to open checkout overlay');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button onClick={handleClick} disabled={loading} className="px-4 py-2 bg-success text-foreground rounded flex items-center gap-2">
        {loading && <span className="inline-block w-4 h-4 border-2 border-foreground border-t-transparent rounded-full animate-spin" />}
        <span>{children ?? (loading ? 'Starting…' : 'Upgrade to Pro')}</span>
      </button>

      {showFallback && fallbackUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-surface/40" onClick={() => setShowFallback(false)} />
          <div className="bg-surface rounded-lg shadow-lg p-6 z-10 w-full max-w-md border border-surface-2">
            <h3 className="text-lg font-semibold mb-2 text-foreground">Open checkout</h3>
            <p className="text-sm muted mb-4">We could not open the inline Paddle overlay. You can continue to checkout via the link below.</p>
            <div className="flex gap-2">
              <a href={fallbackUrl} target="_blank" rel="noreferrer" className="flex-1 px-4 py-2 bg-accent text-foreground rounded text-center">Open in new tab</a>
              <button onClick={() => { window.location.href = fallbackUrl; }} className="px-4 py-2 bg-surface-2 text-foreground rounded">Redirect</button>
            </div>
            <div className="mt-4 text-right">
              <button onClick={() => setShowFallback(false)} className="text-sm muted">Close</button>
            </div>
          </div>
        </div>
      )}
      {showSuccessToast && (
        <div className="fixed bottom-6 right-6 z-50">
          <div className="bg-success text-foreground px-4 py-2 rounded shadow-md">Payment successful — thanks! 🎉</div>
        </div>
      )}
    </>
  );
}
