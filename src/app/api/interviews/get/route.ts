import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
  try {
    // parse request body safely (some callers may POST without a body)
    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown> || {};
    } catch {
      body = {};
    }
    const id = String(body?.id || req.nextUrl.searchParams.get('id') || '');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    // Fetch interview row. Avoid selecting audio columns that may not exist in older schemas.
    const { data, error } = await supabase.from('interviews').select('id, transcript, analysis, status, created_at, owner').eq('id', id).limit(1);
    if (error) throw error;
    if (!data || !data[0]) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const row = data[0] as Record<string, unknown>;

    // Default: do not expose audio URL unless the requester is authenticated and owns the file
    const authHeader = req.headers.get('authorization') || '';
    const tokenRaw = authHeader.startsWith('Bearer ') ? authHeader.replace('Bearer ', '').trim() : authHeader.trim();

    if (!tokenRaw) {
      // strip audio info for unauthenticated callers
      delete row.audio_path;
      delete row.audio_signed_url;
      return NextResponse.json({ data: row });
    }

    // verify user
    const { data: userData, error: userErr } = await supabase.auth.getUser(tokenRaw as string);
    if (userErr || !userData?.user) {
      // invalid token — strip audio
      delete row.audio_path;
      delete row.audio_signed_url;
      return NextResponse.json({ data: row });
    }
    const user = userData.user;

    // Use explicit owner column for access control
    const owner = String(row.owner || '');
    if (owner && owner === user.id) {
      return NextResponse.json({ data: row });
    }

    // not owner: hide audio fields
    delete row.audio_path;
    delete row.audio_signed_url;
    return NextResponse.json({ data: row });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
