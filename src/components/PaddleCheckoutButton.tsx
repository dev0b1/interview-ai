"use client";

import React from 'react';

interface Props {
  priceId: string;
  onSuccess?: () => void;
  children?: React.ReactNode;
  userId?: string | null;
}

declare global {
  interface Window { Paddle?: any; }
}

export default function PaddleCheckoutButton({ priceId, onSuccess, children, userId }: Props) {
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
    if (!priceId || priceId.trim() === '') {
      console.error('[PaddleCheckout] Missing priceId, aborting checkout', { priceId });
      alert('Payment configuration error: price ID is missing. Please contact support.');
      setLoading(false);
      return;
    }
    console.log('[PaddleCheckout] Starting checkout flow', { priceId, userId });
    // Open a blank popup synchronously so we can navigate to checkout URL
    // later without being blocked by popup blockers. If window.open fails
    // (returns null) we'll fall back to showing the inline modal.
    let popup: Window | null = null;
    try {
      popup = window.open('', '_blank');
    } catch (e) {
      popup = null;
    }

    try {
      // create transaction on server (Paddle Billing)
      const res = await fetch('/api/paddle-billing/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ priceId: priceId, userId: userId ?? null }),
      });
      const j = await res.json();
      // Log server response for easier debugging when overlay opens with undefined product
      try {
        console.log('[PaddleCheckout] create checkout response', { 
          raw: j, 
          priceId,
          extractedTransaction: j.transactionId ?? j.transaction?.id,
          extractedCheckoutUrl: j.checkoutUrl ?? j.checkout_url,
          paddleAvailable: Boolean(paddle),
          paddleCheckoutOpen: Boolean(paddle?.Checkout?.open)
        });
      } catch (e) {}
      if (!res.ok) {
        // Surface server error to the user for easier debugging
        const msg = j?.error || j?.message || JSON.stringify(j);
        console.error('Create checkout returned error:', msg);
        alert(`Checkout failed: ${msg}`);
        return;
      }

      const transactionId = j.transactionId ?? j.transaction?.id;
      const checkoutUrl = j.checkoutUrl ?? j.checkout_url;

      // Require transactionId for overlay checkout - never fall back to product-based checkout
      if (!transactionId) {
        console.warn('[PaddleCheckout] No transactionId in response, falling back to direct URL', { j });
        if (checkoutUrl) {
          window.location.href = checkoutUrl;
          return;
        }
        alert('Checkout configuration error: no transaction ID or URL. Please contact support.');
        return;
      }

      // Always use Paddle JS SDK for checkout when available
      if (paddle?.Checkout?.open && typeof paddle.Checkout.open === 'function') {
        try {
          // close the temporary popup — overlay will be used instead
          try { popup?.close(); } catch {}

          console.log('[PaddleCheckout] Opening Paddle overlay with transaction', { transactionId });
          
          paddle.Checkout.open({
            transactionId: transactionId,
            items: [{ priceId: priceId, quantity: 1 }],
            settings: {
              displayMode: 'overlay',
              theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
              locale: 'en',
            },
            onComplete: () => {
              // show an inline success toast instead of navigating immediately
              onSuccess?.();
              setShowSuccessToast(true);
              setTimeout(() => setShowSuccessToast(false), 3500);
            },
            onClose: () => {
              // user closed overlay without completing; nothing to do
            }
          });
          return;
        } catch (err) {
          console.warn('Paddle overlay open failed', err);
          // fallthrough to fallback behavior
        }
      }

      // If overlay isn't available, navigate the popup (if opened) to the checkout URL.
      if (checkoutUrl) {
        if (popup) {
          try {
            popup.location.href = checkoutUrl;
            return;
          } catch (err) {
            // Setting location may fail; fall back to modal below
            console.warn('Failed to navigate popup to checkout URL', err);
            try { popup.close(); } catch {}
            popup = null;
          }
        }

        // If popup was blocked, show inline fallback modal with link
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
      // Ensure we don't leave an empty popup open
      try {
        if (popup && !popup.closed) popup.close();
      } catch {}
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
