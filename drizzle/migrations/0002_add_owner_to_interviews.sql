-- Add owner column to interviews for explicit ownership
ALTER TABLE interviews
  ADD COLUMN IF NOT EXISTS owner VARCHAR(255);

-- Optional: index owner for quick lookups
CREATE INDEX IF NOT EXISTS idx_interviews_owner ON interviews(owner);
