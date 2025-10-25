-- Add recording and AI analysis related columns to interviews
ALTER TABLE interviews
  ADD COLUMN IF NOT EXISTS audio_path TEXT,
  ADD COLUMN IF NOT EXISTS audio_signed_url TEXT,
  ADD COLUMN IF NOT EXISTS video_signed_url TEXT,
  ADD COLUMN IF NOT EXISTS ai_feedback TEXT,
  ADD COLUMN IF NOT EXISTS internal_metrics TEXT;

-- Optional: indexes for faster lookup on signed urls or owner
CREATE INDEX IF NOT EXISTS idx_interviews_audio_path ON interviews(audio_path);
CREATE INDEX IF NOT EXISTS idx_interviews_owner ON interviews(owner);
