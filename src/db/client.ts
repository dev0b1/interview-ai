import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL || '';
const pool = new Pool({ connectionString });

// Lazily import drizzle to avoid hard dependency during quick dev cycles
let _db: unknown = null;
(async () => {
  try {
    // The import is optional; drizzle may not be installed in some dev environments.
    // Use a dynamic import and check for the exported drizzle function before calling it.
    // @ts-expect-error - dynamic import may not have types in this environment
    const mod = await import('drizzle-orm/node-postgres');
    const maybeDrizzle = (mod as Record<string, unknown>).drizzle;
    if (typeof maybeDrizzle === 'function') {
      // result type from drizzle is intentionally unknown here to avoid pulling in types
      _db = (maybeDrizzle as unknown as (p: unknown) => unknown)(pool);
    }
  } catch {
    // drizzle not available; leave _db as null stub
  }
})();

export const db = _db as unknown;
