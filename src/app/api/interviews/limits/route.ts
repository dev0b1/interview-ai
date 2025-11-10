import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const tokenRaw = authHeader.startsWith('Bearer ') ? authHeader.replace('Bearer ', '').trim() : authHeader.trim();

    if (!tokenRaw) {
      return NextResponse.json({ anonymous: true, message: 'Unauthenticated' });
    }

    // Resolve user via supabase auth
    try {
      const { data: ud, error: ue } = await supabase.auth.getUser(tokenRaw);
      if (ue || !ud?.user) return NextResponse.json({ anonymous: true, message: 'Unauthenticated' }, { status: 401 });

      const userId = ud.user.id;

  const MAX_FREE = Number(process.env.MAX_INTERVIEWS_FREE ?? '3');
  const MAX_SUB_MONTHLY = Number(process.env.MAX_INTERVIEWS_SUBSCRIBED_MONTHLY ?? '25');

      // Check subscription status: prefer `subscriptions` table and verify
      // current_period_end has not passed. Fall back to profiles.pro/pro_expires_at.
      const { data: subs } = await supabase.from('subscriptions').select('status, current_period_end').eq('user_id', userId).limit(1);
      let isSubscribed = false;
      if (Array.isArray(subs) && subs.length > 0) {
        const s = subs[0] as any;
        const active = s.status === 'active';
        const periodEnd = s.current_period_end ? new Date(s.current_period_end) : null;
        const notExpired = !periodEnd || periodEnd > new Date();
        isSubscribed = active && notExpired;
      } else {
        const { data: profile } = await supabase.from('profiles').select('pro, pro_expires_at').eq('id', userId).limit(1).maybeSingle();
        if (profile) {
          const pro = Boolean((profile as any).pro);
          const expires = (profile as any).pro_expires_at ? new Date((profile as any).pro_expires_at) : null;
          isSubscribed = pro && (!expires || expires > new Date());
        }
      }

  if (isSubscribed) {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const { count } = await supabase.from('interviews').select('id', { count: 'exact' }).eq('owner', userId).gte('created_at', startOfMonth);
        const used = Number(count ?? 0);
        const remaining = Math.max(0, MAX_SUB_MONTHLY - used);
        return NextResponse.json({ anonymous: false, isSubscribed: true, usedThisMonth: used, remaining, limit: MAX_SUB_MONTHLY });
      }

      // Free user: check purchased credits first; if credits present, expose credits as remaining.
      const { data: profile } = await supabase.from('profiles').select('credits').eq('id', userId).limit(1).maybeSingle();
      const credits = profile ? Number((profile as any).credits ?? 0) : 0;
      if (credits > 0) {
        return NextResponse.json({ anonymous: false, isSubscribed: false, usedTotal: 0, remaining: credits, limit: credits, credits });
      }

      // Otherwise fall back to free total interviews cap
      const { count } = await supabase.from('interviews').select('id', { count: 'exact' }).eq('owner', userId);
      const used = Number(count ?? 0);
      const remaining = Math.max(0, MAX_FREE - used);
      return NextResponse.json({ anonymous: false, isSubscribed: false, usedTotal: used, remaining, limit: MAX_FREE });
    } catch (e) {
      console.warn('Failed to compute interview limits', e);
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  } catch (err) {
    console.error('Limits route error', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
