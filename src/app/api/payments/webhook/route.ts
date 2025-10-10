import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabaseClient';

// Minimal Paddle webhook handler. Paddle sends form-encoded data and a signature.
export async function POST(req: NextRequest) {
  try {
    const bodyText = await req.text();

    // Try parse as form-encoded into a map
    const params = Object.fromEntries(new URLSearchParams(bodyText));

    // If a public key is provided, verify the signature (Paddle sends 'p_signature')
    const publicKeyPem = process.env.PADDLE_PUBLIC_KEY || '';
    if (publicKeyPem && params.p_signature) {
      try {
        // p_signature is base64-encoded; Paddle expects verification over a serialized payload
        const sig = Buffer.from(params.p_signature as string, 'base64');
        // Remove p_signature from verification payload
        const verification = { ...params } as Record<string, string>;
        delete verification.p_signature;

        // Paddle verification: sort keys and serialize values
        const sorted = Object.keys(verification).sort().reduce((acc: Record<string, string>, k) => {
          acc[k] = String(verification[k] ?? '');
          return acc;
        }, {} as Record<string, string>);

        const serialized = JSON.stringify(sorted);

        const verifier = crypto.createVerify('sha1');
        verifier.update(serialized);
        verifier.end();
        const ok = verifier.verify(publicKeyPem, sig);
        if (!ok) {
          console.warn('Paddle webhook signature invalid');
          return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 400 });
        }
      } catch {
        console.warn('Paddle signature verification failed');
        return NextResponse.json({ ok: false, error: 'verification error' }, { status: 400 });
      }
    }

    // Process event — update payments table and credit user on successful payments
    const alert = String(params.alert_name ?? '');
    const orderId = String(params.order_id ?? params.order_number ?? '');
    const passthrough = String(params.passthrough ?? '');
    const gross = String(params.gross ?? params.sale_gross ?? '0');
    const currency = String(params.currency ?? '');

    try {
      // Check existing payment to ensure idempotency
      let alreadyProcessed = false;
      if (orderId) {
        try {
          type ExistingPayment = { id?: string; status?: string };
          const { data: existing } = await supabase.from('payments').select('id, status').eq('id', orderId).limit(1).maybeSingle() as { data: ExistingPayment | null };
          if (existing && existing.status === 'payment_succeeded') {
            alreadyProcessed = true;
          }
        } catch {
          // ignore selection errors; we'll attempt to upsert below
        }
      }

      // Upsert the payment record (record raw payload and status)
      try {
        await supabase.from('payments').upsert({ id: orderId || undefined, user_id: passthrough || undefined, raw: JSON.stringify(params), status: alert || 'unknown', amount: parseFloat(gross || '0') || null, currency }, { returning: 'minimal' });
      } catch {
        console.warn('failed to upsert payment record');
      }

      // If already processed, skip granting credits
      if (alreadyProcessed) {
        return NextResponse.json({ ok: true });
      }

      // On a successful payment alert, credit the user if passthrough contains a user id
      if ((alert === 'payment_succeeded' || alert === 'payment_success') && passthrough) {
        try {
          // Map amount to credits: $10 => 1 credit (adjust as needed)
          const amountNum = parseFloat(gross || '0');
          const creditsToGrant = Math.max(1, Math.floor((amountNum / 10)));

          // Fetch profile's credits column and increment safely (use public.profiles)
          type ProfileCreditsRow = { credits?: number | null };
          const { data: profileRows } = await supabase.from('profiles').select('credits').eq('id', passthrough) as { data: ProfileCreditsRow[] | null };
          const existingCredits = profileRows && profileRows.length ? Number(profileRows[0].credits ?? 0) : null;
          if (existingCredits !== null) {
            await supabase.from('profiles').update({ credits: existingCredits + creditsToGrant }).eq('id', passthrough).select();
          } else {
            // upsert a profile record with initial credits
            await supabase.from('profiles').upsert({ id: passthrough, credits: creditsToGrant }, { returning: 'minimal' });
          }
        } catch {
          console.warn('failed to credit user on payment');
        }
      }
    } catch {
      console.warn('payment processing error');
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
