"use client";

import { initializePaddle, Paddle } from '@paddle/paddle-js';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export interface CheckoutProps {
  user?: User;
}

export interface User {
  id?: string;
  customerId?: string | null;
  email?: string | null;
}

export function Checkout({ user }: CheckoutProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [paddle, setPaddle] = useState<any>();

  useEffect(() => {
    // Don't worry about initializing it multiple times between navigations.
    // Paddle library will be initialized as a singleton instance in a global variable.
    // Subsequent calls to `initializePaddle` will return the same instance.
    (initializePaddle as any)({
      environment: process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT as any,
      token: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
      eventCallback(event: any) {
        switch (event.name) {
          // Redirect to home page after checkout is closed
          case 'checkout.closed':
            router.push('/');
            break;
        }
      },
    } as any).then((paddleInstance: any) => {
      if (paddleInstance) {
        setPaddle(paddleInstance);
      }
    });
  }, [router]);

  useEffect(() => {
    // This is passed by Paddle when the customer clicks a payment method update link.
    // The link is included in payment confirmation emails.
    // The link can also be retrieved from the Paddle API in `subscription.management_urls.update_payment_method`
    // You can also manually pass the transaction ID for the same purpose.
  const transactionId = searchParams.get('_ptxn');

    if (transactionId) {
      (paddle as any)?.Checkout?.open?.({
        settings: {
          allowLogout: false,
        },
        transactionId,
      });
      return;
    }

    // Pass the priceId as a search parameter to the checkout page.
  const priceId = searchParams.get('priceId');

    if (priceId) {
      (paddle as any)?.Checkout?.open?.({
        settings: {
          // Prevent user from changing their email
          allowLogout: false,
        },
        items: [{ priceId, quantity: 1 }],
        customer: {
          // You can pass the customer ID if you have it
          // This is the Paddle customer ID, not the user ID from your database
          id: user?.customerId,
          // You can pass the customer email if you have it
          // You can't use it if you're passing id.
          email: user?.email,
        },
        // You can pass additional data to the subscription
        customData: {
          userId: user?.id,
        },
      });
      return;
    }

    // Redirect to the home page if no transactionId or priceId
    router.push('/');
  }, [paddle, searchParams, router, user]);

  return <p>Preparing checkout...</p>;
}

