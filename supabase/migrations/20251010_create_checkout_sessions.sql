-- Migration: create checkout_sessions table
-- Date: 2025-10-10

CREATE TABLE IF NOT EXISTS public.checkout_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  product_id TEXT,
  amount NUMERIC(10,2),
  currency TEXT,
  status TEXT DEFAULT 'created',
  raw JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS checkout_sessions_user_id_idx ON public.checkout_sessions (user_id);
