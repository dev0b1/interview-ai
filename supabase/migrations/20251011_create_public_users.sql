-- Migration: create public.users table for app profiles and credits
-- Date: 2025-10-11

CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  email TEXT,
  credits INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_credits_idx ON public.users (credits);
