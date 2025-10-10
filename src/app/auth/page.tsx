"use client";

import React from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnon);

export default function AuthPage() {
  const [status, setStatus] = React.useState<string | null>(null);

  async function handleGoogleSignIn(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    setStatus('loading');
    try {
  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/dashboard` : undefined;
      const result = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } }) as unknown as { error?: unknown } | null;
      if (result && (result as { error?: unknown }).error) {
        console.error('signInWithOAuth error', (result as { error?: unknown }).error);
        setStatus('error');
      } else {
        setStatus('redirecting');
      }
    } catch (err) {
      setStatus('error');
      console.error('Google sign-in failed', err);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-white">
      <div className="container mx-auto px-6 py-12">
        <div className="max-w-md mx-auto bg-white rounded-2xl shadow-lg p-8">
          <h2 className="text-2xl font-semibold mb-4">Sign in</h2>
          <p className="text-sm text-gray-600 mb-6">Sign in with Google to access your interviews.</p>

          <button
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-3 border border-gray-200 hover:shadow-md transition px-4 py-3 rounded-md bg-white text-gray-700"
          >
            <svg className="w-5 h-5" viewBox="0 0 533.5 544.3" xmlns="http://www.w3.org/2000/svg" aria-hidden>
              <path d="M533.5 278.4c0-18.5-1.5-37.6-4.6-55.6H272v105.2h147.2c-6.4 35.2-25.6 64.9-54.8 85v70.7h88.4c51.7-47.6 82.7-117.9 82.7-205.3z" fill="#4285F4"/>
              <path d="M272 544.3c73.5 0 135.3-24.4 180.4-66.3l-88.4-70.7c-24.6 16.5-56 26.3-92 26.3-70.7 0-130.6-47.7-152-111.5H33.6v69.9C78.2 487.9 167 544.3 272 544.3z" fill="#34A853"/>
              <path d="M120 323.8c-10.4-30.9-10.4-64.2 0-95.1V158.8H33.6c-41.6 81.7-41.6 178.4 0 260.1L120 323.8z" fill="#FBBC05"/>
              <path d="M272 107.7c38.6 0 73.2 13.3 100.4 39.4l75.1-75.1C407.6 24 345.8 0 272 0 167 0 78.2 56.4 33.6 138.1l86.4 69.9C141.4 155.4 201.3 107.7 272 107.7z" fill="#EA4335"/>
            </svg>
            <span className="text-sm font-medium">Sign in with Google</span>
          </button>

          <div className="mt-4 text-sm text-gray-500">
            {status === 'loading' && 'Opening Google sign-in…'}
            {status === 'redirecting' && 'Redirecting…'}
            {status === 'error' && 'Sign-in failed. Try again.'}
          </div>
        </div>
      </div>
    </main>
  );
}
