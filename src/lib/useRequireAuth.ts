"use client";

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useMemo } from 'react';

export function useRequireAuth() {
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (!url || !anon) return null as unknown as SupabaseClient;
    return createClient(url, anon, { auth: { persistSession: true } });
  }, []);

  useEffect(() => {
    let mounted = true;
    async function ensureSession() {
      if (!supabase || typeof window === 'undefined') return;
      try {
        const s1 = await supabase.auth.getSession();
        const hasSession = !!(s1 as any)?.data?.session;
        if (hasSession) return;

        // Attempt to parse session from OAuth redirect fragment
        if (typeof (supabase.auth as any).getSessionFromUrl === 'function') {
          try {
            await (supabase.auth as any).getSessionFromUrl();
          } catch {
            // ignore
          }
        }

        const s2 = await supabase.auth.getSession();
        const hasSession2 = !!(s2 as any)?.data?.session;
        if (!hasSession2 && mounted) {
          window.location.href = '/auth';
        }
      } catch {
        if (mounted) window.location.href = '/auth';
      }
    }

    ensureSession();
    return () => { mounted = false; };
  }, [supabase]);

  return { supabase } as { supabase: SupabaseClient | null };
}
