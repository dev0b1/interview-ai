-- Migration: create payments and subscriptions tables, add credits to users
-- Date: 2025-10-09

-- Create payments table to record provider callbacks and orders
CREATE TABLE IF NOT EXISTS public.payments (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  provider TEXT,
  product_id TEXT,
  amount NUMERIC(10,2),
  currency TEXT,
  status TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_user_id_idx ON public.payments (user_id);
CREATE INDEX IF NOT EXISTS payments_created_at_idx ON public.payments (created_at);

-- Create subscriptions table for long-running subscriptions
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  provider TEXT,
  product_id TEXT,
  status TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  raw JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON public.subscriptions (user_id);

-- Add a dedicated credits column to the users table if not present
-- Only attempt to ALTER if the public.users table actually exists (some projects keep users in auth.users)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'credits'
    ) THEN
      ALTER TABLE public.users ADD COLUMN credits INTEGER DEFAULT 0;
    END IF;
  END IF;
END$$;

-- Optional: keep user_metadata for compatibility; no-op if the column is already present
-- Note: Some installations keep a separate auth.users table; this migration modifies the project's public.users table.
