import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

function isUserAdmin(user: { user_metadata?: unknown; email?: string | null } | null | undefined) {
  if (!user) return false;
  try {
    const meta = user.user_metadata;
    if (meta && typeof meta === 'object') {
      const val = (meta as Record<string, unknown>)['is_admin'];
      return val === true || val === 'true' || val === 1;
    }
  } catch (e) {
    // ignore
  }
  return false;
}

export async function GET(req: Request) {
  // No local bypass: require token-based admin or env/service checks

  // Accept Authorization header or cookie `sb_access_token`
  const authHdr = req.headers.get('authorization') || '';
  const tokenFromHdr = authHdr.startsWith('Bearer ') ? authHdr.replace('Bearer ', '').trim() : authHdr.trim();
  let token = tokenFromHdr;

  if (!token) {
    const cookie = req.headers.get('cookie') || '';
    const match = cookie.match(/(?:^|;)\s*sb_access_token=([^;]+)/);
    if (match) token = decodeURIComponent(match[1]);
  }

  if (!token) return NextResponse.json({ error: 'missing token' }, { status: 401 });

  try {
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return NextResponse.json({ error: 'invalid token' }, { status: 401 });

  const user = userData.user;

  // Check user metadata first
  const isAdminFromMeta = isUserAdmin(user);
  if (isAdminFromMeta) return NextResponse.json({ ok: true, isAdmin: true });

    // Fallback: check profiles table (may not have is_admin column if migrations weren't run)
    try {
      const { data: profile, error: pErr } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
      if (!pErr && profile?.is_admin) return NextResponse.json({ ok: true, isAdmin: true });
    } catch (e) {
      // ignore and continue to env-based check if column doesn't exist
      console.warn('profiles.is_admin check skipped (maybe migrations not applied)', e);
    }

    // Env-based admin list (comma separated emails)
    const adminsEnv = process.env.ADMIN_ADMINS || '';
    const adminEmails = adminsEnv.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const userEmail = (user.email || '').toLowerCase();
    if (adminEmails.length > 0 && userEmail && adminEmails.includes(userEmail)) {
      return NextResponse.json({ ok: true, isAdmin: true });
    }

    return NextResponse.json({ ok: true, isAdmin: false });
  } catch (e) {
    console.error('admin/check error', e);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
