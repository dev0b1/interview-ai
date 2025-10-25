/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabaseClient';

// Verify HMAC-style signature used by Paddle Billing (paddle-signature header)
function verifySignature(raw: string, signatureHeader: string | null) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET || '';
  if (!secret) return false;
  if (!signatureHeader) return false;
  // signature header: 't=timestamp,h1=signature'
  const parts = signatureHeader.split(';').map((s) => s.trim());
  const tsPart = parts.find((p) => p.startsWith('t='));
  const h1Part = parts.find((p) => p.startsWith('h1='));
  if (!tsPart || !h1Part) return false;
  const ts = tsPart.split('=')[1];
  const h1 = h1Part.split('=')[1];

  const signed = `${ts}:${raw}`;
  const expected = crypto.createHmac('sha256', secret).update(signed).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(h1, 'hex'));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    const sig = req.headers.get('paddle-signature');
    if (!verifySignature(raw, sig)) {
      return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 401 });
    }

    const event = JSON.parse(raw);
    const type = String(event.event_type ?? event.type ?? 'unknown');
    console.log('Paddle Billing webhook:', type);

    // Basic storage for webhook payloads
    try {
      await supabase.from('payments').insert({ id: event.id ?? undefined, provider: 'paddle_billing', raw: event, status: type });
    } catch {
      // ignore storage errors
    }

    // Handle event types in a separate service or below
    // Example: subscription.created, subscription.updated, subscription.canceled, transaction.completed

    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    console.error('Paddle Billing webhook error', (err as any)?.message || err);
    return NextResponse.json({ error: String((err as any)?.message || err) }, { status: 500 });
  }
}
