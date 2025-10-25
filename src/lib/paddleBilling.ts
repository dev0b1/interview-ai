/*
  Lightweight Paddle Billing helper.
  - Dynamically imports the official SDK if available (@paddle/paddle-node-sdk)
  - Exposes minimal methods used by server routes: createTransaction, getSubscription, cancelSubscription
  - If the SDK isn't installed or PADDLE_BILLING_API_KEY not set, methods will throw a clear error.
*/
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Paddle, Environment, TransactionsCreateRequest } from '@paddle/paddle-node-sdk';

let paddleClient: Paddle | null = null;

function getPaddleClient(): Paddle {
  if (paddleClient) return paddleClient;
  const key = process.env.PADDLE_BILLING_API_KEY || process.env.PADDLE_API_KEY;
  if (!key) throw new Error('PADDLE_BILLING_API_KEY (or PADDLE_API_KEY) not set');

  const env = (process.env.PADDLE_ENVIRONMENT === 'production') ? Environment.production : Environment.sandbox;
  paddleClient = new Paddle(key, { environment: env });
  return paddleClient;
}

export async function createTransaction(payload: TransactionsCreateRequest) {
  const client = getPaddleClient();
  // The SDK provides transactions.create
  const tx = await client.transactions.create(payload as any);
  return tx;
}

export async function getSubscription(id: string) {
  const client = getPaddleClient();
  if (!client.subscriptions || typeof client.subscriptions.get !== 'function') {
    throw new Error('Paddle SDK subscriptions API not available');
  }
  return await client.subscriptions.get(id as any);
}

export async function cancelSubscription(id: string, opts?: any) {
  const client = getPaddleClient();
  if (!client.subscriptions || typeof client.subscriptions.cancel !== 'function') {
    throw new Error('Paddle SDK subscriptions API not available');
  }
  return await client.subscriptions.cancel(id as any, opts || {});
}

const paddleBilling = {
  createTransaction,
  getSubscription,
  cancelSubscription,
};

export default paddleBilling;
