-- Migration: add Paddle billing fields to profiles
-- Date: 2025-11-07

ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS pro BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS paddle_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS paddle_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS pro_expires_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS profiles_pro_idx ON public.profiles (pro);
CREATE INDEX IF NOT EXISTS profiles_pro_expires_idx ON public.profiles (pro_expires_at);
