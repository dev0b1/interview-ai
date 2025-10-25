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
    // remove surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
  return true;
}

async function run() {
  // For local dev where the certificate chain may include untrusted intermediates:
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  // If DATABASE_URL isn't set, try to load .env.local or .env from project root
  if (!process.env.DATABASE_URL && !process.env.SUPABASE_DB_URL) {
    const path = require('path');
    const root = path.join(__dirname, '..');
    tryLoadDotenvFile(path.join(root, '.env.local')) || tryLoadDotenvFile(path.join(root, '.env'));
  }

  const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!databaseUrl) {
    console.error('Missing DATABASE_URL (set it in your shell or .env.local)');
    process.exit(1);
  }

  // If Supabase CLI is available, prefer to run `supabase db push` which is
  // generally more reliable for applying the supabase/migrations SQL set.
  // If the CLI is not available or the push fails, fall back to the SQL runner below.
  try {
    const { spawnSync } = require('child_process');
    const which = spawnSync('supabase', ['--version'], { stdio: 'ignore' });
    if (!which.error && which.status === 0) {
      console.log('Supabase CLI detected. Attempting `supabase db push --schema supabase/migrations`...');
      // Run the push command and inherit stdio so user sees CLI output
      const push = spawnSync('supabase', ['db', 'push', '--schema', 'supabase/migrations'], { stdio: 'inherit' });
      if (!push.error && push.status === 0) {
        console.log('`supabase db push` completed successfully.');
        process.exit(0);
      } else {
        console.warn('`supabase db push` failed or returned non-zero exit code; falling back to SQL runner.');
      }
    }
    // If global supabase CLI wasn't available or failed, try using npx so
    // users don't need to install the CLI globally.
    console.log('Trying `npx supabase db push` (no global install required)...');
    const npxPush = spawnSync('npx', ['--yes', 'supabase', 'db', 'push', '--schema', 'supabase/migrations'], { stdio: 'inherit' });
    if (!npxPush.error && npxPush.status === 0) {
      console.log('`npx supabase db push` completed successfully.');
      process.exit(0);
    } else {
      console.warn('`npx supabase db push` failed or returned non-zero exit code; falling back to SQL runner.');
    }
  } catch (e) {
    // ignore CLI detection errors and fall back to SQL runner
  }

  const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

  const migrations = [
    path.join(__dirname, '..', 'supabase', 'migrations', '20251009_create_payments_subscriptions.sql'),
    path.join(__dirname, '..', 'supabase', 'migrations', '20251010_create_checkout_sessions.sql'),
    path.join(__dirname, '..', 'supabase', 'migrations', '20251011_create_public_users.sql'),
    path.join(__dirname, '..', 'supabase', 'migrations', '20251012_create_profiles.sql'),
  ];

  // Helper: sleep for ms
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  // Retry loop for connecting & running migrations — transient network errors happen (pooler, TLS, starter DB)
  const maxAttempts = 5;
  let attempt = 0;
  let succeeded = false;

  while (attempt < maxAttempts && !succeeded) {
    attempt += 1;
    try {
      console.log(`Migration attempt ${attempt}/${maxAttempts} — connecting to DB...`);
      const client = await pool.connect();
      try {
        for (const m of migrations) {
          console.log('Running migration:', m);
          const sql = readFileSync(m, 'utf8');
          await client.query(sql);
          console.log('OK:', m);
        }
        succeeded = true;
      } finally {
        try { client.release(); } catch (e) { /* ignore release errors */ }
      }
    } catch (err) {
      console.error(`Migration attempt ${attempt} failed:`, err && err.message ? err.message : err);
      if (attempt < maxAttempts) {
        const backoff = Math.min(30000, 500 * Math.pow(2, attempt));
        console.log(`Retrying in ${Math.round(backoff/1000)}s...`);
        await sleep(backoff);
      } else {
        console.error('All migration attempts failed.');
        process.exitCode = 1;
      }
    }
  }

  try {
    await pool.end();
  } catch (e) {
    // ignore
  }
}

run();
