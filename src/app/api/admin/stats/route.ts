/**
 * Minimal admin stats endpoint
 * - Requires admin token (Authorization header or sb_access_token cookie) or SUPABASE_SERVICE_ROLE_KEY
 * - Returns total users, total interviews, and last 5 interviews (id, owner, created_at)
 */
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
  // user metadata or env check (safe access without `any`)
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
    // total users: union of profiles, public.users, auth users (if available), and interview owners
    const userIds = new Set<string>();
    const userEmails = new Set<string>();

    // profiles
    let profilesCount = 0;
    try {
      const pRes = await supabase.from('profiles').select('id, email');
      if (!pRes.error && Array.isArray(pRes.data)) {
        (pRes.data as Array<Record<string, unknown>>).forEach((r) => {
          const id = r['id'];
          const email = r['email'];
          if (id) userIds.add(String(id));
          if (email) userEmails.add(String(email).toLowerCase());
        });
        profilesCount = pRes.data.length;
      }
    } catch (e) {
      // ignore
      profilesCount = 0;
    }

    // public.users (project-specific users table)
    let publicUsersCount = 0;
    try {
      const uRes = await supabase.from('users').select('id, email');
      if (!uRes.error && Array.isArray(uRes.data)) {
        (uRes.data as Array<Record<string, unknown>>).forEach((r) => {
          const id = r['id'];
          const email = r['email'];
          if (id) userIds.add(String(id));
          if (email) userEmails.add(String(email).toLowerCase());
        });
        publicUsersCount = uRes.data.length;
      }
    } catch {
      // ignore
      publicUsersCount = 0;
    }

    // interview owners
    let interviewOwnersCount = 0;
    try {
      const ivRes = await supabase.from('interviews').select('owner').limit(10000);
      if (!ivRes.error && Array.isArray(ivRes.data)) {
        (ivRes.data as Array<Record<string, unknown>>).forEach((r) => {
          const owner = r['owner'];
          if (owner) userIds.add(String(owner));
        });
        interviewOwnersCount = Array.from(new Set((ivRes.data || []).map((r: Record<string, unknown>) => r['owner']).filter(Boolean))).length;
      }
    } catch {
      // ignore
      interviewOwnersCount = 0;
    }

    // auth users (requires service role key)
    let authUsersCount: number | null = null;
    if (hasServiceRole) {
      try {
        // supabase.auth.admin.listUsers() or supabase.auth.listUsers()
        // handle multiple possible shapes
        // call admin/listUsers if available; handle multiple shapes safely
        const authObj = supabase.auth as unknown as Record<string, unknown>;
        let list: unknown = null;
        try {
          const adminObj = authObj['admin'] as Record<string, unknown> | undefined;
          if (adminObj && typeof adminObj['listUsers'] === 'function') {
            list = await (adminObj['listUsers'] as unknown as () => Promise<unknown>)();
          } else if (typeof authObj['listUsers'] === 'function') {
            list = await (authObj['listUsers'] as unknown as () => Promise<unknown>)();
          }
        } catch (err) {
          list = null;
        }

        if (list && typeof list === 'object') {
          const dataObj = (list as Record<string, unknown>)['data'];
          let usersArr: Array<Record<string, unknown>> | null = null;
          if (dataObj && typeof dataObj === 'object' && Array.isArray((dataObj as any).users)) {
            usersArr = (dataObj as any).users as Array<Record<string, unknown>>;
          } else if (Array.isArray(dataObj)) {
            usersArr = dataObj as Array<Record<string, unknown>>;
          }
          if (usersArr && Array.isArray(usersArr)) {
            usersArr.forEach((u) => {
              const id = u['id'];
              const email = u['email'];
              if (id) userIds.add(String(id));
              if (email) userEmails.add(String(email).toLowerCase());
            });
            authUsersCount = usersArr.length;
          }
        }
      } catch (e) {
        // ignore
      }
    }

  // compute totalUsers as unique ids if available, else unique emails
  let totalUsers = userIds.size;
  if (totalUsers === 0) totalUsers = userEmails.size;

    // total interviews
    let totalInterviews = 0;
    try {
      const ivRes = await supabase.from('interviews').select('id', { head: true, count: 'exact' });
      totalInterviews = Number(ivRes.count || 0);
    } catch (e) {
      // fallback: count rows
      try {
        const ivRows = await supabase.from('interviews').select('id').limit(10000);
        totalInterviews = (ivRows.data || []).length;
      } catch {
        totalInterviews = 0;
      }
    }

    // total revenue (payments) — try payments table count of successful payments
    let totalRevenue = 0;
    try {
      // attempt to sum amounts for payments with status='paid' or count subscriptions
      const paymentsRes = await supabase.from('payments').select('amount, status');
      if (!paymentsRes.error && Array.isArray(paymentsRes.data)) {
        const paid = (paymentsRes.data as Array<Record<string, unknown>>).filter((p) => String((p['status'] || '')).toLowerCase() === 'paid');
        totalRevenue = paid.reduce((s, p) => s + Number(p['amount'] || 0), 0);
      }
    } catch {
      totalRevenue = 0;
    }

    // last 5 interviews
    const lastRes = await supabase.from('interviews').select('id, owner, created_at').order('created_at', { ascending: false }).limit(5);
    const last = lastRes.data || [];

    return NextResponse.json({ ok: true, totalUsers, totalInterviews, totalRevenue, breakdown: { profilesCount: profilesCount ?? 0, publicUsersCount: publicUsersCount ?? 0, interviewOwnersCount: interviewOwnersCount ?? 0, authUsersCount: authUsersCount }, last5: last });
  } catch (e) {
    console.error('admin/stats error', e);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
