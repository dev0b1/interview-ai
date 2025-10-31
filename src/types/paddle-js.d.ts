declare module '@paddle/paddle-js' {
  export type Paddle = {
    Checkout: {
      open: (opts: { transactionId?: string; onComplete?: (info?: any) => void }) => void;
    };
  };

  export function initializePaddle(opts: { environment?: 'sandbox' | 'production'; token?: string }): Promise<Paddle>;
}
