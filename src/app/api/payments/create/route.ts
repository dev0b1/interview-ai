import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

// Small UUIDv4 generator (crypto-backed when available)
function uuidv4(): string {
  try {
    const b = crypto.getRandomValues(new Uint8Array(16));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (b[6] &= 0x0f), (b[6] |= 0x40), (b[8] &= 0x3f), (b[8] |= 0x80);
    const s = Array.from(b).map((n: number) => n.toString(16).padStart(2, '0')).join('');
    return `${s.substr(0,8)}-${s.substr(8,4)}-${s.substr(12,4)}-${s.substr(16,4)}-${s.substr(20,12)}`;
  } catch {
    // fallback to Math.random (not cryptographically strong)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}

type CreateBody = { amount?: string; currency?: string; product_id?: string };

export async function POST(req: NextRequest) {
  try {
    const { amount = '10.00', currency = 'USD', product_id = '' } = (await req.json()) as CreateBody;

    // Authenticate the user via Bearer token and create a server-side checkout session
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.replace('Bearer ', '').trim() : authHeader.trim();
    let userId: string | undefined = undefined;
    if (token) {
      const { data: userData } = await supabase.auth.getUser(token);
      if (userData?.user?.id) userId = userData.user.id;
    }

    // Create a local checkout session id
    const sessionId = uuidv4();
    try {
      await supabase.from('checkout_sessions').upsert({ id: sessionId, user_id: userId, product_id, amount: parseFloat(amount) || null, currency, status: 'created' });
    } catch {
      // ignore DB write errors; we can still proceed
    }

    // Prefer server-side Paddle API if credentials are provided
    const PADDLE_VENDOR_ID = process.env.PADDLE_VENDOR_ID || '';
    const PADDLE_API_KEY = process.env.PADDLE_API_KEY || '';

    const passthrough = sessionId; // pass session id instead of user id

    if (PADDLE_VENDOR_ID && PADDLE_API_KEY && product_id) {
      // Create a checkout link via Paddle's API
      const params = new URLSearchParams();
      params.set('vendor_id', PADDLE_VENDOR_ID);
      params.set('vendor_auth_code', PADDLE_API_KEY);
      params.set('product_id', product_id);
      params.set('price', amount);
      params.set('currency', currency);
      params.set('passthrough', passthrough);

      const resp = await fetch('https://vendors.paddle.com/api/2.0/product/generate_pay_link', {
        method: 'POST',
        body: params,
      });

      const json = await resp.json();
      if (json && json.success && json.response && json.response.url) {
        return NextResponse.json({ checkout_url: json.response.url });
      }
      console.warn('Paddle create link failed', json);
    }

    // Fallback demo URL (non-authoritative)
    const demoUrl = `https://vendors.paddle.com/checkout/${encodeURIComponent(product_id || 'demo') }?amount=${encodeURIComponent(amount)}&currency=${encodeURIComponent(currency)}&passthrough=${encodeURIComponent(passthrough)}`;
    return NextResponse.json({ checkout_url: demoUrl });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
