import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
  try {
  const body = await req.json();
  const token = typeof body === 'object' && body !== null && 'token' in body ? (body as Record<string, unknown>).token : undefined;
    if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });

  // verify JWT with Supabase
  const { data, error } = await supabase.auth.getUser(String(token));
    if (error) return NextResponse.json({ error: error.message }, { status: 401 });

    return NextResponse.json({ user: data.user });
  } catch (err: unknown) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
