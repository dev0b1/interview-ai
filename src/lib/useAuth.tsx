"use client";

import { useEffect } from 'react';
import { useAuthContext } from './AuthProvider';

// Consolidated hook: ensures the provider is mounted and exposes a single API surface.
export function useAuth() {
  const ctx = useAuthContext();

  // Ensure consumers can call this hook to assert provider presence.
  useEffect(() => {
    // no-op
  }, []);

  return {
    supabase: ctx.supabase,
    user: ctx.user,
    session: ctx.session,
    initializing: ctx.initializing,
    signOut: ctx.signOut,
    signInWithOAuth: ctx.signInWithOAuth,
  };
}

export default useAuth;
