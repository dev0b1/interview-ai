import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

async function checkAdminToken(req: Request) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.replace('Bearer ', '').trim() : auth.trim();
  // fallback to cookie
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

type ProfileRow = {
  id: string;
  display_name?: string | null;
  email?: string | null;
  pro?: boolean | null;
  pro_expires_at?: string | null;
  created_at?: string | null;
  is_admin?: boolean | null;
};

export async function GET(req: Request) {
  // Allow if server has service role key, or caller presents an admin token
  const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!hasServiceRole) {
    const ok = await checkAdminToken(req);
    if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    // Basic list of profiles and users
    // Support optional search query `q`
    const url = new URL(req.url);
    const q = (url.searchParams.get('q') || '').trim();

    // Try the richer selection first (may fail if migrations haven't been applied).
    let data: any = null;
    try {
      let query = supabase.from('profiles').select('id, display_name, email, pro, pro_expires_at, created_at, is_admin').order('created_at', { ascending: false }).limit(200);
      if (q) {
        // search email OR display_name
        query = supabase.from('profiles').select('id, display_name, email, pro, pro_expires_at, created_at, is_admin').or(`email.ilike.%${q}%,display_name.ilike.%${q}%`).order('created_at', { ascending: false }).limit(200);
      }
      const res = await query;
      if (res.error) throw res.error;
      data = res.data;
    } catch (e) {
      // If the DB doesn't have some columns (common when migrations weren't been run), fall back
      // to a minimal safe selection that exists in the base schema.
      let safeQuery = supabase.from('profiles').select('id, display_name, email, created_at').order('created_at', { ascending: false }).limit(200);
      if (q) {
        safeQuery = supabase.from('profiles').select('id, display_name, email, created_at').or(`email.ilike.%${q}%,display_name.ilike.%${q}%`).order('created_at', { ascending: false }).limit(200);
      }
      const safeRes = await safeQuery;
      if (safeRes.error) throw safeRes.error;
      data = safeRes.data;
    }

    const profiles = (data as ProfileRow[]) || [];

    // Compute interview counts for listed profiles (lightweight in-memory aggregation).
    const ids = profiles.map(p => p.id).filter(Boolean);
    if (ids.length > 0) {
      const ivRes = await supabase.from('interviews').select('owner,id').in('owner', ids).order('created_at', { ascending: false }).limit(10000);
      if (!ivRes.error) {
        const counts: Record<string, number> = {};
        (ivRes.data || []).forEach((r: any) => {
          const owner = r.owner as string | undefined;
          if (!owner) return;
          counts[owner] = (counts[owner] || 0) + 1;
        });
        // attach counts to profiles
        profiles.forEach(p => {
          (p as any).interview_count = counts[p.id] || 0;
        });
      }
    }

    // If some profiles are missing email/display_name (common when rows were created minimally),
    // try to enrich them from the `users` table (project-specific) as a best-effort.
    try {
      const missing = profiles.filter(p => !(p as any).email || !(p as any).display_name).map(p => p.id).filter(Boolean);
      if (missing.length > 0) {
        const uRes = await supabase.from('users').select('id, email').in('id', missing as string[]);
        if (!uRes.error && Array.isArray(uRes.data)) {
          const byId: Record<string, any> = {};
          (uRes.data as any[]).forEach(r => { if (r.id) byId[String(r.id)] = r; });
          profiles.forEach(p => {
            const extra = byId[p.id];
            if (extra) {
              if (!p.email && extra.email) p.email = extra.email;
              // display_name may not be available in `users`; leave as-is if missing
            }
          });
        }
      }
    } catch (e) {
      // ignore enrichment errors
    }

    return NextResponse.json({ ok: true, profiles });
  } catch (e: unknown) {
    console.error('admin/users error', e);
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
