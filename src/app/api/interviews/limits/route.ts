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
      const MAX_SUB_MONTHLY = Number(process.env.MAX_INTERVIEWS_SUBSCRIBED_MONTHLY ?? '20');

      // Check subscription status
      const { data: subs } = await supabase.from('subscriptions').select('status').eq('user_id', userId).limit(1);
      const isSubscribed = Array.isArray(subs) && subs.length > 0 && subs[0].status === 'active';

      if (isSubscribed) {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const { count } = await supabase.from('interviews').select('id', { count: 'exact' }).eq('owner', userId).gte('created_at', startOfMonth);
        const used = Number(count ?? 0);
        const remaining = Math.max(0, MAX_SUB_MONTHLY - used);
        return NextResponse.json({ anonymous: false, isSubscribed: true, usedThisMonth: used, remaining, limit: MAX_SUB_MONTHLY });
      }

      // Free user: total interviews
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
