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

export async function GET(req: Request) {
  const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!hasServiceRole) {
    const ok = await checkAdminToken(req);
    if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const userId = url.searchParams.get('user_id');
  if (!userId) return NextResponse.json({ error: 'missing user_id' }, { status: 400 });

  try {
    type InterviewRow = {
      id: string;
      owner?: string | null;
      status?: string | null;
      created_at?: string | null;
      audio_signed_url?: string | null;
      video_signed_url?: string | null;
      analysis?: unknown;
      ai_feedback?: Record<string, unknown> | string | null;
    };

    const { data, error } = await supabase.from('interviews').select('id, owner, status, created_at, audio_signed_url, video_signed_url, analysis, ai_feedback').eq('owner', userId).order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    const interviews = (data as InterviewRow[]) || [];
    return NextResponse.json({ ok: true, interviews });
  } catch (e: unknown) {
    console.error('admin/interviews error', e);
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
