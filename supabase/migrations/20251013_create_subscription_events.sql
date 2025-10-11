-- Migration: create subscription_events table
-- Date: 2025-10-13

CREATE TABLE IF NOT EXISTS public.subscription_events (
  id TEXT PRIMARY KEY,
  subscription_id TEXT,
  user_id TEXT,
  event_type TEXT,
  event_time TIMESTAMPTZ DEFAULT now(),
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscription_events_subscription_idx ON public.subscription_events (subscription_id);
CREATE INDEX IF NOT EXISTS subscription_events_user_idx ON public.subscription_events (user_id);
