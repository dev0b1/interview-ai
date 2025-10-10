-- Drizzle migration: create interviews table

CREATE TABLE IF NOT EXISTS interviews (
  id VARCHAR(255) PRIMARY KEY,
  transcript TEXT,
  analysis TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
