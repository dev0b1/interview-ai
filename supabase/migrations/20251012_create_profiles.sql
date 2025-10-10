-- Migration: create public.profiles table for app-level profile data
-- Date: 2025-10-12

CREATE TABLE IF NOT EXISTS public.profiles (
  id TEXT PRIMARY KEY,
  email TEXT,
  display_name TEXT,
  credits INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profiles_credits_idx ON public.profiles (credits);
