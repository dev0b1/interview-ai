import { pgTable, text, varchar, timestamp } from 'drizzle-orm/pg-core';

export const interviews = pgTable('interviews', {
  id: varchar('id', { length: 64 }).primaryKey(),
  transcript: text('transcript').notNull(),
  analysis: text('analysis'),
  status: varchar('status', { length: 32 }).default('pending'),
  created_at: timestamp('created_at').defaultNow(),
});
