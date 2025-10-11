-- Migration: add pro column to public.profiles
-- Date: 2025-10-13

ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS pro BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS profiles_pro_idx ON public.profiles (pro);
