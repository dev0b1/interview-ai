import { pgTable, text, varchar, timestamp } from 'drizzle-orm/pg-core';

export const interviews = pgTable('interviews', {
  id: varchar('id', { length: 64 }).primaryKey(),
  transcript: text('transcript').notNull(),
  analysis: text('analysis'),
  // recording metadata
  audio_path: text('audio_path'),
  audio_signed_url: text('audio_signed_url'),
  video_signed_url: text('video_signed_url'),
  // AI-generated feedback and internal metrics
  ai_feedback: text('ai_feedback'),
  internal_metrics: text('internal_metrics'),
  owner: varchar('owner', { length: 64 }),
  status: varchar('status', { length: 32 }).default('pending'),
  created_at: timestamp('created_at').defaultNow(),
});
