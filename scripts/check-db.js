#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function tryLoadDotenvFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, 'utf8');
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

// For local dev where the certificate chain may include untrusted intermediates:
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

if (!process.env.DATABASE_URL) {
  const root = path.join(__dirname, '..');
  tryLoadDotenvFile(path.join(root, '.env.local')) || tryLoadDotenvFile(path.join(root, '.env'));
}

const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!databaseUrl) {
  console.error('Missing DATABASE_URL in env or .env.local');
  process.exit(2);
}

(async () => {
  const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  let client;
  try {
    client = await pool.connect();
    console.log('Connected to DB');

    const tablesRes = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
    console.log('Public tables:', tablesRes.rows.map(r => r.table_name).join(', '));

    const q = async (sql, name) => {
      try {
        const r = await client.query(sql);
        console.log(name + ':', r.rows && r.rows[0] ? r.rows[0] : r.rowCount);
      } catch (e) {
        console.log(name + ' - ERROR:', e.message);
      }
    };

    await q('SELECT COUNT(*) AS count FROM public.payments', 'payments_count');
    await q('SELECT COUNT(*) AS count FROM public.checkout_sessions', 'checkout_sessions_count');

    const cols = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles'");
    if (cols.rowCount === 0) {
      console.log('public.profiles: NOT FOUND');
    } else {
      console.log('public.profiles columns:', cols.rows.map(r => r.column_name).join(', '));
    }

  } catch (err) {
    console.error('DB check failed:', err.message);
    process.exitCode = 1;
  } finally {
    if (client) client.release();
    await pool.end();
  }
})();
