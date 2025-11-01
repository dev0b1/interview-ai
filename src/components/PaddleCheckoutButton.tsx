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
  const [showFallback, setShowFallback] = React.useState(false);
  const [fallbackUrl, setFallbackUrl] = React.useState<string | null>(null);
  const [showSuccessToast, setShowSuccessToast] = React.useState(false);

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
        if ((window as any).Paddle) {
          try {
            if (vendor && typeof (window as any).Paddle.Setup === 'function') {
              (window as any).Paddle.Setup({ vendor: Number(vendor) });
            }
          } catch (e) {
            console.warn('Paddle.Setup failed', e);
          }
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

      // If Paddle overlay is available, try opening inline overlay
      if (paddle && transactionId && typeof paddle.Checkout?.open === 'function') {
        try {
          paddle.Checkout.open({
            transactionId,
            onComplete: () => {
              // show an inline success toast instead of navigating immediately
              onSuccess?.();
              setShowSuccessToast(true);
              // auto-hide after a short period
              setTimeout(() => setShowSuccessToast(false), 3500);
            },
            onClose: () => {
              // user closed overlay without completing; nothing to do
            }
          });
          return;
        } catch (err) {
          console.warn('Paddle overlay open failed', err);
          // fallthrough to fallback modal
        }
      }

      // If we don't have overlay or it failed, use graceful fallback modal
      if (checkoutUrl) {
        setFallbackUrl(checkoutUrl);
        setShowFallback(true);
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
    <>
      <button onClick={handleClick} disabled={loading} className="px-4 py-2 bg-emerald-600 text-white rounded flex items-center gap-2">
        {loading && <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
        <span>{children ?? (loading ? 'Starting…' : 'Upgrade to Pro')}</span>
      </button>

      {showFallback && fallbackUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowFallback(false)} />
          <div className="bg-white rounded-lg shadow-lg p-6 z-10 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-2">Open checkout</h3>
            <p className="text-sm text-gray-600 mb-4">We could not open the inline Paddle overlay. You can continue to checkout via the link below.</p>
            <div className="flex gap-2">
              <a href={fallbackUrl} target="_blank" rel="noreferrer" className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded text-center">Open in new tab</a>
              <button onClick={() => { window.location.href = fallbackUrl; }} className="px-4 py-2 bg-gray-100 rounded">Redirect</button>
            </div>
            <div className="mt-4 text-right">
              <button onClick={() => setShowFallback(false)} className="text-sm text-gray-500">Close</button>
            </div>
          </div>
        </div>
      )}
      {showSuccessToast && (
        <div className="fixed bottom-6 right-6 z-50">
          <div className="bg-emerald-600 text-white px-4 py-2 rounded shadow-md">Payment successful — thanks! 🎉</div>
        </div>
      )}
    </>
  );
}
