#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
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

if (!process.env.DATABASE_URL) {
  const root = path.join(__dirname, '..');
  tryLoadDotenvFile(path.join(root, '.env.local')) || tryLoadDotenvFile(path.join(root, '.env'));
}

const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!databaseUrl) {
  console.error('Missing DATABASE_URL in env or .env.local');
  process.exit(2);
}

// For local dev where the certificate chain may include untrusted intermediates:
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

(async () => {
  const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    const userId = 'test-user-1';
    const email = 'test+user@example.com';
    const creditsToAdd = 10;
    const paymentId = 'test-pay-' + (crypto?.randomUUID ? crypto.randomUUID() : Date.now());

    // Upsert profile (app-level profile table)
    await client.query(
      `INSERT INTO public.profiles (id, email, credits) VALUES ($1, $2, 0)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`,
      [userId, email]
    );

    // Insert payment record
    await client.query(
      `INSERT INTO public.payments (id, user_id, provider, product_id, amount, currency, status, raw)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      [paymentId, userId, 'test', 'test-product', creditsToAdd, 'USD', 'succeeded', JSON.stringify({ test: true })]
    );

  // Credit the profile
  await client.query(`UPDATE public.profiles SET credits = COALESCE(credits,0) + $1 WHERE id = $2`, [creditsToAdd, userId]);

    console.log('Seeded test payment:', paymentId, 'for user:', userId, 'credits added:', creditsToAdd);
  } catch (err) {
    console.error('Seeding failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
