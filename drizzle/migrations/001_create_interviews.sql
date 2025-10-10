-- Create interviews table
CREATE TABLE IF NOT EXISTS interviews (
  id varchar(64) PRIMARY KEY,
  transcript text NOT NULL,
  analysis text,
  status varchar(32) DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);
