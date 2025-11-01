"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Loading from '../components/Loading';
import { createClient, SupabaseClient, Session, User } from '@supabase/supabase-js';

const asRecord = (x: unknown): Record<string, unknown> | null => (x && typeof x === 'object') ? x as Record<string, unknown> : null;

function getSessionFromResp(resp: unknown): Session | null {
  const r = asRecord(resp);
  if (!r) return null;
  // supabase auth.getSession() returns { data: { session } }
  const data = asRecord(r['data']);
  if (data && data['session']) return data['session'] as Session;
  // If a Session-like object was passed directly, accept it
  if (r['access_token'] || r['user']) return resp as Session;
  return null;
}

function getUserFromSessionObj(sess: unknown): User | null {
  const sRec = asRecord(sess);
  if (!sRec) return null;
  const userObj = sRec['user'] ?? sRec['user'];
  const uRec = asRecord(userObj);
  if (!uRec) return null;
  return (uRec as unknown) as User;

}

type AuthContextShape = {
  supabase: SupabaseClient | null;
  user: User | null;
  session: Session | null;
  signOut: () => Promise<void>;
  initializing: boolean;
  signInWithOAuth: (opts: { provider: string; options?: Record<string, unknown> }) => Promise<unknown>;
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
        const sess = getSessionFromResp(s);
        if (!mounted) return;
        setSession(sess);
        setUser(getUserFromSessionObj(sess));
        // Ensure a public `profiles` row exists for this auth user so admin stats
        // and profile-driven features work without manual migrations.
        try {
          const authUser = getUserFromSessionObj(sess);
          if (authUser && authUser.id) {
            const meta = asRecord((authUser as unknown as Record<string, unknown>)['user_metadata']) ?? {};
            const displayName = (meta['full_name'] ?? meta['name']) ?? null;
            // best-effort upsert (anon key may be allowed depending on RLS)
            (async () => {
              try {
                await (supabase as unknown as SupabaseClient).from('profiles').upsert({ id: authUser.id, email: authUser.email, display_name: displayName }, { returning: 'minimal' });
              } catch {
                // ignore profile sync errors in client
              }
            })();
          }
        } catch {
          // ignore
        }
        // set a non-HttpOnly cookie with the access token so server middleware can read it
        try {
          const sessRec = getSessionFromResp(sess as unknown) ? (sess as unknown as Record<string, unknown>) : null;
          const token = sessRec ? (sessRec['access_token'] as string | undefined) : undefined;
          if (sess && token) {
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
              // ignore cookie parse errors
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
          const nextSession = s as Session | null;
          setSession(nextSession);
          setUser(getUserFromSessionObj(nextSession));

          // on sign-in events, ensure profiles upsert
          try {
            const authUser = getUserFromSessionObj(nextSession);
            if (authUser && authUser.id) {
              const meta = asRecord((authUser as unknown as Record<string, unknown>)['user_metadata']) ?? {};
              const displayName = (meta['full_name'] ?? meta['name']) ?? null;
              (async () => {
                try {
                  await (supabase as unknown as SupabaseClient).from('profiles').upsert({ id: authUser.id, email: authUser.email, display_name: displayName }, { returning: 'minimal' });
                } catch {
                  // ignore
                }
              })();
            }
          } catch {
            // ignore
          }
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
      try {
        // clear the non-HttpOnly access token cookie so server middleware no longer sees it
        document.cookie = 'sb_access_token=; Path=/; Max-Age=0; SameSite=Lax';
      } catch {
        // ignore cookie clear errors
      }
    } catch {
      // ignore
    }
  }

  async function signInWithOAuth(opts: { provider: string; options?: Record<string, unknown> }) {
    if (!supabase) return null;
    try {
      // supabase client types can be strict; cast in a small localized way
      return await (supabase as unknown as SupabaseClient).auth.signInWithOAuth(opts as any);
    } catch (err) {
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
