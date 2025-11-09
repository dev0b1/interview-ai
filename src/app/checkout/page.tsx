"use client";
import { initializePaddle } from '@paddle/paddle-js';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/useAuth';

export default function CheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [paddle, setPaddle] = useState<any>(null);
  const auth = useAuth();
  const user = auth.user;

  useEffect(() => {
    initializePaddle({
      environment: process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT as 'sandbox' | 'production',
      token: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN!,
      eventCallback: (event: any) => {
        if (event.name === 'checkout.closed') {
          router.push('/');
        }
      },
    } as any).then((paddleInstance) => {
      if (paddleInstance) {
        setPaddle(paddleInstance);
      }
    });
  }, [router]);

  useEffect(() => {
    if (!paddle) return;

    const transactionId = searchParams.get('_ptxn');
    if (transactionId) {
      paddle.Checkout.open({
        settings: { allowLogout: false },
        transactionId,
      });
      return;
    }

    const priceId = searchParams.get('priceId');
    if (priceId) {
      if (!user?.id) {
        // ensure user is signed in before opening checkout
        router.push('/auth');
        return;
      }

      paddle.Checkout.open({
        settings: { allowLogout: false },
        items: [{ priceId, quantity: 1 }],
        // Pass user id and email using Billing's customData/customer fields
        customData: { userId: user.id },
        customer: { email: user.email },
      });
      return;
    }

    router.push('/');
  }, [paddle, searchParams, router, user?.id, user?.email]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p>Preparing checkout...</p>
    </div>
  );
}