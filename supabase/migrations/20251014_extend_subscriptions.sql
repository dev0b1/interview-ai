-- Migration: extend subscriptions table with period fields and cancel_at
-- Date: 2025-10-13

ALTER TABLE IF EXISTS public.subscriptions
  ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_bill_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_at TIMESTAMPTZ;
