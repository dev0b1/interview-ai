-- Migration: create subscriptions table to track recurring subscriptions
-- Date: 2025-10-14

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  provider TEXT,
  subscription_id TEXT,
  product_id TEXT,
  status TEXT,
  next_bill_date TIMESTAMPTZ,
  raw JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON public.subscriptions (user_id);
CREATE INDEX IF NOT EXISTS subscriptions_next_bill_date_idx ON public.subscriptions (next_bill_date);
