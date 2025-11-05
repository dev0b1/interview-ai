/*
  Lightweight Paddle Billing helper.
  - Dynamically imports the official SDK if available (@paddle/paddle-node-sdk)
  - Exposes minimal methods used by server routes: createTransaction, getSubscription, cancelSubscription
  - If the SDK isn't installed or PADDLE_BILLING_API_KEY not set, methods will throw a clear error.
*/
/*
  Lightweight Paddle Billing helper (HTTP based)
  - Uses direct HTTP calls to Paddle Billing API (no SDK required)
  - Exposes createTransaction, getSubscription, cancelSubscription
  - Respects PADDLE_ENVIRONMENT === 'sandbox' to switch base URL
  - Includes timeout and a small retry/backoff strategy
*/

const PADDLE_API_URL = 'https://api.paddle.com';
const PADDLE_SANDBOX_URL = 'https://sandbox-api.paddle.com';

const DEFAULT_TIMEOUT_MS = 10000; // 10s
const DEFAULT_RETRIES = 2;

// Keep the payload loosely typed so callers using slightly different shapes
// (e.g. coming from req.json()) don't cause compile errors. We validate at runtime.
export type CreatePayload = Record<string, any>;

type CreateResult = {
  id?: string | number;
  transaction?: any;
  checkoutUrl?: string | null;
  checkout_url?: string | null;
  raw?: any;
};

function getBaseUrl() {
  const isSandbox = process.env.PADDLE_ENVIRONMENT === 'sandbox';
  return isSandbox ? PADDLE_SANDBOX_URL : PADDLE_API_URL;
}

async function fetchWithTimeout(url: string, opts: RequestInit = {}, timeout = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

async function requestWithRetries(url: string, opts: RequestInit = {}, retries = DEFAULT_RETRIES) {
  let attempt = 0;
  console.log('[PaddleBilling] Making API request', {
    url,
    method: opts.method,
    attempt: attempt + 1,
    retries
  });
  let lastErr: any = null;
  while (attempt <= retries) {
    try {
      const res = await fetchWithTimeout(url, opts);
      return res;
    } catch (err: any) {
      lastErr = err;
      // AbortError or network error
      attempt++;
      const backoff = 200 * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

export async function createTransaction(payload: CreatePayload): Promise<CreateResult> {
  // Use PADDLE_API_KEY as the canonical key name for consistency
  const apiKey = process.env.PADDLE_API_KEY;
  if (!apiKey) throw new Error('Paddle API key not configured (PADDLE_API_KEY)');

  // Normalize items from different caller shapes
  const items = Array.isArray(payload.items)
    ? payload.items
    : (payload.items_from_body || payload.items || (payload.priceId ? [{ priceId: payload.priceId, quantity: 1 }] : undefined));

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new Error('payload.items must be a non-empty array (or include priceId)');
  }

  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/transactions`;

  const body: any = {
    items: items.map((it: any) => ({ price_id: it.priceId ?? it.product_id ?? it.price_id, quantity: it.quantity ?? 1 })),
  };
  if (payload.customerEmail) body.customer = { email: payload.customerEmail };
  if (payload.customerId) body.customer_id = payload.customerId;
  if (payload.customData) body.custom_data = payload.customData;
  // support checkoutSettings.successUrl or successUrl at top-level
  const successUrl = payload.checkoutSettings?.successUrl || payload.successUrl;
    if (successUrl) body.success_url = successUrl;

  const opts: RequestInit = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
  try {
    console.log('[PaddleBilling] POST to Paddle', { url, body });
    const res = await requestWithRetries(url, opts);
    if (!res.ok) {
      // read text first so we always capture raw response
      const text = await res.text().catch(() => '');
      let errBody: any = {};
      try {
        errBody = text ? JSON.parse(text) : {};
      } catch (e) {
        errBody = { raw_text: text };
      }
      const msg = errBody?.error?.detail || errBody?.error?.message || `Paddle API error: ${res.status}`;
      const e: any = new Error(msg);
      (e as any).status = res.status;
      (e as any).raw = errBody;
      console.error('[PaddleBilling] Paddle API returned non-OK', { status: res.status, errBody });
      throw e;
    }
    const text = await res.text().catch(() => '');
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      data = { raw_text: text };
    }
    const d = data?.data ?? data;
    const checkoutUrl = d?.checkout?.url ?? d?.checkout_url ?? null;
    console.log('[PaddleBilling] Paddle response', { d });
    return { id: d?.id, transaction: d, checkoutUrl, checkout_url: checkoutUrl, raw: data };
  } catch (err: any) {
    console.error('Paddle API error:', err?.message ?? err, { raw: err?.raw });
    throw err;
  }
}

export async function getSubscription(subscriptionId: string) {
  const apiKey = process.env.PADDLE_BILLING_API_KEY || process.env.PADDLE_API_KEY;
  if (!apiKey) throw new Error('Paddle API key not configured');
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/subscriptions/${encodeURIComponent(subscriptionId)}`;
  const opts: RequestInit = { method: 'GET', headers: { Authorization: `Bearer ${apiKey}` } };
  const res = await requestWithRetries(url, opts);
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody?.error?.detail || `Failed to fetch subscription: ${res.status}`);
  }
  const data = await res.json().catch(() => ({}));
  return data?.data ?? data;
}

export async function cancelSubscription(subscriptionId: string, optsIn?: Record<string, any>) {
  const apiKey = process.env.PADDLE_BILLING_API_KEY || process.env.PADDLE_API_KEY;
  if (!apiKey) throw new Error('Paddle API key not configured');
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`;
  // Accept camelCase or snake_case from callers
  const effective = optsIn?.effective_from ?? optsIn?.effectiveFrom ?? 'next_billing_period';
  const body = { effective_from: effective };
  const opts: RequestInit = { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  const res = await requestWithRetries(url, opts);
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody?.error?.detail || `Failed to cancel subscription: ${res.status}`);
  }
  const data = await res.json().catch(() => ({}));
  return data?.data ?? data;
}

const paddleBilling = { createTransaction, getSubscription, cancelSubscription };
export default paddleBilling;
