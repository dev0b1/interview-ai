import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.replace('Bearer ', '').trim() : auth.trim();
    if (!token) return NextResponse.json({ error: 'missing auth token' }, { status: 401 });

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return NextResponse.json({ error: 'invalid token' }, { status: 401 });

    const uid = userData.user.id;
    const { data, error } = await supabase.from('payments').select('id, amount, currency, status, created_at').eq('user_id', uid).order('created_at', { ascending: false }).limit(20);
    if (error) return NextResponse.json({ error: 'failed to fetch payments' }, { status: 500 });

    return NextResponse.json({ payments: data ?? [] });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
