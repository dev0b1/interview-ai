import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

async function checkAdminToken(req: Request) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.replace('Bearer ', '').trim() : auth.trim();
  let finalToken = token;
  if (!finalToken) {
    const cookie = req.headers.get('cookie') || '';
    const m = cookie.match(/(?:^|;)\s*sb_access_token=([^;]+)/);
    if (m) finalToken = decodeURIComponent(m[1]);
  }
  if (!finalToken) return false;

  try {
  const { data: userData, error: userErr } = await supabase.auth.getUser(finalToken);
  if (userErr || !userData?.user) return false;
  const user = userData.user;
  if (isUserAdmin(user)) return true;
    const { data: profile, error: pErr } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
    if (!pErr && profile?.is_admin) return true;
    // Env-based admin list
    const adminsEnv = process.env.ADMIN_ADMINS || '';
    const adminEmails = adminsEnv.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const userEmail = (user.email || '').toLowerCase();
    if (adminEmails.length > 0 && userEmail && adminEmails.includes(userEmail)) return true;
    return false;
  } catch (e) {
    console.warn('admin token check failed', e);
    return false;
  }
}

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

export async function POST(req: Request) {
  // Allow if service role key present (server automation) OR caller is an admin user
  const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!hasServiceRole) {
    const ok = await checkAdminToken(req);
    if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const userId = body?.userId || body?.id || null;
    if (!userId || typeof userId !== 'string') return NextResponse.json({ error: 'missing userId' }, { status: 400 });

    // Upsert profile with is_admin = true (creates row if missing)
    try {
      const { error } = await supabase.from('profiles').upsert({ id: userId, is_admin: true }, { returning: 'minimal' });
      if (error) throw error;
      return NextResponse.json({ ok: true, userId });
    } catch (err: any) {
      // If the DB is missing the is_admin column (common if migrations weren't run),
      // fall back to creating the profile row (without is_admin) so the user exists,
      // and return a helpful message. If you have SUPABASE_SERVICE_ROLE_KEY set,
      // consider running the migrations or re-running the richer upsert.
      const msg = String(err?.message || err);
      console.warn('promote upsert failed, falling back to minimal insert:', msg);

      try {
        // ensure profile row exists
        const insertRes = await supabase.from('profiles').insert({ id: userId }, { returning: 'minimal' });
        if (insertRes.error) {
          console.error('fallback profile insert failed', insertRes.error);
          return NextResponse.json({ error: String(insertRes.error.message || insertRes.error) }, { status: 500 });
        }
      } catch (ie) {
        console.error('fallback insert exception', ie);
        return NextResponse.json({ error: 'failed to promote user and failed fallback insert' }, { status: 500 });
      }

      return NextResponse.json({ ok: true, userId, note: 'is_admin column may be missing; profile created but admin flag not set. Run migrations to enable persistent admin flag.' });
    }
  } catch (e) {
    console.error('admin/promote error', e);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
