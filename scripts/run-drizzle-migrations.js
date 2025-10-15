#!/usr/bin/env node
const { readFileSync } = require('fs');
const path = require('path');
const { Pool } = require('pg');

function tryLoadDotenvFile(filePath) {
  const { existsSync, readFileSync } = require('fs');
  if (!existsSync(filePath)) return false;
  const content = readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
  return true;
}

async function run() {
  if (!process.env.DATABASE_URL && !process.env.SUPABASE_DB_URL) {
    const root = path.join(__dirname, '..');
    tryLoadDotenvFile(path.join(root, '.env.local')) || tryLoadDotenvFile(path.join(root, '.env'));
  }

  const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!databaseUrl) {
    console.error('Missing DATABASE_URL (set it in your shell or .env.local)');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

  const migrationsDir = path.join(__dirname, '..', 'drizzle', 'migrations');
  const fs = require('fs');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  try {
    const client = await pool.connect();
    try {
      for (const f of files) {
        const m = path.join(migrationsDir, f);
        console.log('Running migration:', m);
        const sql = readFileSync(m, 'utf8');
        await client.query(sql);
        console.log('OK:', m);
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
