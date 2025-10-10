"use client";

import { useEffect } from 'react';
import { useAuthContext } from './AuthProvider';

export function useRequireAuth() {
  const ctx = useAuthContext();

  // The provider already handles redirect when not authenticated and initializes session.
  // Expose the provider's supabase/session/user to callers.
  useEffect(() => {
    // no-op: this hook exists so pages can call it to ensure the provider is mounted.
  }, []);

  return { supabase: ctx.supabase, user: ctx.user, session: ctx.session };
}
