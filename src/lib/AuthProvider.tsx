/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Loading from '../components/Loading';
import { createClient, SupabaseClient, Session, User } from '@supabase/supabase-js';

type AuthContextShape = {
  supabase: SupabaseClient | null;
  user: User | null;
  session: Session | null;
  signOut: () => Promise<void>;
  initializing: boolean;
  signInWithOAuth: (opts: { provider: string; options?: any }) => Promise<any>;
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
  const [initializing, setInitializing] = useState(true);

  // Client-side routing helpers - declare these hooks unconditionally so hook order is stable
  const pathname = usePathname();
  const router = useRouter();

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
        // set a non-HttpOnly cookie with the access token so server middleware can read it
        try {
          if (sess && (sess as any).access_token) {
            const token = (sess as any).access_token as string;
            // derive max-age from token exp if possible
            try {
              const parts = token.split('.');
              if (parts.length === 3) {
                const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
                const exp = payload.exp as number | undefined;
                if (exp) {
                  const maxAge = Math.max(0, exp - Math.floor(Date.now() / 1000));
                  document.cookie = `sb_access_token=${token}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
                } else {
                  document.cookie = `sb_access_token=${token}; Path=/; SameSite=Lax`;
                }
              } else {
                document.cookie = `sb_access_token=${token}; Path=/; SameSite=Lax`;
              }
            } catch {
              document.cookie = `sb_access_token=${(sess as any).access_token}; Path=/; SameSite=Lax`;
            }
          } else {
            // clear cookie when no session
            document.cookie = 'sb_access_token=; Path=/; Max-Age=0; SameSite=Lax';
          }
        } catch {
          // ignore cookie errors
        }

        // Listen for changes
        const { data: listener } = supabase.auth.onAuthStateChange((event, s) => {
          const nextSession = (s as any) ?? null;
          setSession(nextSession);
          setUser((nextSession as any)?.user ?? null);
        });

  // mark initialization complete once we've set initial session
  setInitializing(false);

        return () => {
          mounted = false;
          listener?.subscription?.unsubscribe?.();
        };
      } catch {
        // ignore init errors
        setInitializing(false);
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
    } catch {
      // ignore
    }
  }

  async function signInWithOAuth(opts: { provider: string; options?: any }) {
    if (!supabase) return null;
    try {
      // delegate to supabase client
      return await (supabase as SupabaseClient).auth.signInWithOAuth(opts as any);
    } catch (err) {
      // bubble up a minimal error shape
      return { error: err };
    }
  }

  // While initializing, render a small centered spinner to avoid blank UI
  // When initialization completes and there is no user, redirect on the client to /auth.
  useEffect(() => {
    if (!initializing && !user) {
      try {
        router.replace('/auth');
      } catch {
        // ignore
      }
    }
  }, [initializing, user, router]);

  // If user is signed in and they visit a public path, send them to /dashboard.
  useEffect(() => {
    if (!initializing && user) {
      const publicPaths = ['/', '/auth'];
      if (publicPaths.includes(pathname || '/')) {
        try {
          router.replace('/dashboard');
        } catch {
          // ignore
        }
      }
    }
  }, [initializing, user, pathname, router]);

  // While initializing, render a small centered spinner to avoid blank UI
  if (initializing) {
    return <Loading />;
  }

  return (
    <AuthContext.Provider value={{ supabase, user, session, signOut, initializing, signInWithOAuth }}>{children}</AuthContext.Provider>
  );
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider');
  return ctx;
}
