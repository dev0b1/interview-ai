import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const { data, error } = await supabase.from('interviews').select('id, transcript, analysis, status, created_at').eq('id', id).limit(1);
    if (error) throw error;
    if (!data || !data[0]) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ data: data[0] });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
