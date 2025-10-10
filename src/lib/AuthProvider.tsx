"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createClient, SupabaseClient, Session, User } from '@supabase/supabase-js';

type AuthContextShape = {
  supabase: SupabaseClient | null;
  user: User | null;
  session: Session | null;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextShape | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (!url || !anon) return null as unknown as SupabaseClient;
    return createClient(url, anon, { auth: { persistSession: true } });
  }, []);

  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!supabase) return;

    let mounted = true;
    async function init() {
      try {
        const s = await supabase.auth.getSession();
        const sess = (s as any)?.data?.session ?? null;
        if (!mounted) return;
        setSession(sess);
        setUser((sess as any)?.user ?? null);

        // Listen for changes
        const { data: listener } = supabase.auth.onAuthStateChange((event, s) => {
          const nextSession = (s as any) ?? null;
          setSession(nextSession);
          setUser((nextSession as any)?.user ?? null);
        });

        return () => {
          mounted = false;
          listener?.subscription?.unsubscribe?.();
        };
      } catch (err) {
        // ignore init errors
      }
    }

    init();
    return () => { mounted = false; };
  }, [supabase]);

  async function signOut() {
    if (!supabase) return;
    try {
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
    } catch (err) {
      // ignore
    }
  }

  return (
    <AuthContext.Provider value={{ supabase, user, session, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider');
  return ctx;
}
