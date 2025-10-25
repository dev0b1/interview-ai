-- Add is_admin column to profiles for admin role checks
ALTER TABLE IF EXISTS profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;

-- Optional: set your user as admin
-- Replace <YOUR_USER_ID> with the user's UUID and run separately if desired:
--
-- UPDATE profiles SET is_admin = true WHERE id = '<YOUR_USER_ID>';
