-- Drizzle migration: add is_admin flag to profiles table for admin checks

ALTER TABLE IF EXISTS profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;

-- Optional: index for quick admin lookups (useful if you will query frequently)
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON profiles(is_admin);

-- To mark a specific user as admin (run separately):
-- UPDATE profiles SET is_admin = true WHERE id = '<YOUR_USER_ID>';
