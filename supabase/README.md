Supabase migrations
===================

This folder contains SQL migrations for the project's Supabase/Postgres database.

Apply locally (requires psql and your DATABASE_URL):

```bash
# from the repo root
psql "$DATABASE_URL" -f supabase/migrations/20251009_create_payments_subscriptions.sql
```

Apply using the Supabase CLI:

```bash
supabase db remote set <name> <REMOTE_DB_URL>
supabase db push --schema supabase/migrations
```

Notes:
- The migration is idempotent (uses IF NOT EXISTS and a DO block to add `credits` safely).
- It creates `payments` and `subscriptions` tables and adds a `credits` integer column to `public.users` if missing.
