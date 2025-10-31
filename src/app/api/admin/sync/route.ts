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

export async function GET(req: Request) {
  const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!hasServiceRole) {
    const ok = await checkAdminToken(req);
    if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const results: Record<string, unknown> = {};

    // profiles count
    try {
      const profilesRes = await supabase.from('profiles').select('id', { head: true, count: 'exact' });
      results.profiles = Number(profilesRes.count || 0);
    } catch (e) {
      results.profiles = null;
    }

    // public.users count (project-specific table)
    try {
      const usersRes = await supabase.from('users').select('id', { head: true, count: 'exact' });
      results.public_users = Number(usersRes.count || 0);
    } catch (e) {
      results.public_users = null;
    }

    // distinct interview owners
    try {
      const ivRes = await supabase.from('interviews').select('owner').limit(10000);
      const owners = (ivRes.data || []).map((r: any) => r.owner).filter(Boolean);
      results.distinct_interview_owners = Array.from(new Set(owners));
      results.distinct_interview_owners_count = (results.distinct_interview_owners as any[]).length;
    } catch (e) {
      results.distinct_interview_owners = null;
      results.distinct_interview_owners_count = null;
    }

    // auth users (requires service role)
    if (hasServiceRole) {
      try {
        // supabase.auth.admin.listUsers is available with service role key
        // use a safe call in case runtime uses a different client shape
        // @ts-ignore
        const list = await (supabase.auth.admin?.listUsers ? supabase.auth.admin.listUsers() : (supabase.auth.listUsers ? supabase.auth.listUsers() : Promise.resolve({ data: null })));
        // list shape may be { data: { users: [...] } } or { data: [...] }
        let count = 0;
        if (list && (list as any).data && Array.isArray((list as any).data.users)) {
          count = (list as any).data.users.length;
          results.auth_users = (list as any).data.users.map((u: any) => ({ id: u.id, email: u.email }));
        } else if (list && (list as any).data && Array.isArray((list as any).data)) {
          count = (list as any).data.length;
          results.auth_users = (list as any).data.map((u: any) => ({ id: u.id, email: u.email }));
        } else {
          results.auth_users = null;
        }
        results.auth_users_count = count;
      } catch (e) {
        results.auth_users = null;
        results.auth_users_count = null;
      }
    }

    return NextResponse.json({ ok: true, data: results });
  } catch (e) {
    console.error('admin/sync error', e);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
