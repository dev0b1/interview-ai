-- Migration: add pro_expires_at column to public.profiles
-- Date: 2025-10-13

ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS pro_expires_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS profiles_pro_expires_idx ON public.profiles (pro_expires_at);
