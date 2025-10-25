import { headers, cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import AdminClient from './AdminClient';

/**
 * Minimal env-only admin guard for /admin
 *
 * Behavior:
 * - Reads Authorization header or `sb_access_token` cookie to get a Supabase session token
 * - Calls supabase.auth.getUser(token) to obtain the user's email
 * - Checks process.env.ADMIN_ADMINS (comma-separated emails) for a match
 * - If matched, render AdminClient, otherwise redirect to '/'
 *
 * This avoids any DB migrations or checks against `profiles.is_admin`.
 */
export default async function AdminPage() {
  const hdrs = await headers();
  const cookieStore = await cookies();

  // Accept Authorization header or cookie `sb_access_token`
  const authHdr = hdrs.get('authorization') || '';
  const tokenFromHdr = authHdr.startsWith('Bearer ') ? authHdr.replace('Bearer ', '').trim() : authHdr.trim();
  let token = tokenFromHdr;
  if (!token) {
    const c = cookieStore.get('sb_access_token');
    if (c) token = c.value;
  }

  if (!token) {
    // not authenticated, redirect to home/login
    redirect('/');
  }

  try {
    const { data: userData, error: getUserErr } = await supabase.auth.getUser(token as string);
    if (getUserErr || !userData?.user) {
      redirect('/');
    }

    const user = userData.user;
    const userEmail = (user.email || '').toLowerCase();

    const adminsEnv = process.env.ADMIN_ADMINS || '';
    const adminEmails = adminsEnv.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

    if (userEmail && adminEmails.includes(userEmail)) {
      return <AdminClient />;
    }

    // Not authorized as admin
    redirect('/');
  } catch (e) {
    // On error, redirect to home. Avoid exposing server errors to client here.
    console.error('admin server guard error', e);
    redirect('/');
  }
}
