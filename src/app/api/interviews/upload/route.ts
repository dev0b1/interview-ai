import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

// Security: expect HMAC-SHA256 signature in header 'x-agent-signature' computed over raw body
export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();

    const signature = req.headers.get('x-agent-signature') || '';
    const secret = process.env.AGENT_UPLOAD_SECRET || '';
    if (!secret) {
      console.error('Server misconfigured: AGENT_UPLOAD_SECRET not set');
      return NextResponse.json({ error: 'server misconfigured' }, { status: 500 });
    }

    // compute HMAC on server and compare using timingSafeEqual
    const crypto = await import('crypto');
    const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    // quick checks
    if (!signature || signature.length !== expected.length) {
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
    }
    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');
    try {
      if (!crypto.timingSafeEqual(sigBuf, expBuf)) {
        return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
      }
    } catch {
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
    }

    const payload = JSON.parse(raw || '{}');
    const { interviewId, analysis, transcript } = payload;
    if (!interviewId) return NextResponse.json({ error: 'interviewId required' }, { status: 400 });

    // try to write to Postgres directly if DATABASE_URL is present (drizzle/pg migration step)
    const DATABASE_URL = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
    if (DATABASE_URL) {
      try {
        const { Pool } = await import('pg');
        const pool = new Pool({ connectionString: DATABASE_URL });
        const q = `INSERT INTO interviews (id, transcript, analysis, status, created_at) VALUES ($1,$2,$3,$4, now()) ON CONFLICT (id) DO UPDATE SET transcript=$2, analysis=$3, status=$4`;
        await pool.query(q, [interviewId, JSON.stringify(transcript), JSON.stringify(analysis), 'completed']);
        await pool.end();
        return NextResponse.json({ ok: true, via: 'pg' });
      } catch {
        console.error('PG write failed, falling back to supabase');
      }
    }

    // fallback to Supabase client
    const { data, error } = await supabase.from('interviews').upsert({ id: interviewId, analysis: JSON.stringify(analysis), transcript: JSON.stringify(transcript), status: 'completed' });
    if (error) throw error;

    return NextResponse.json({ ok: true, via: 'supabase', data });
  } catch (err: unknown) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
