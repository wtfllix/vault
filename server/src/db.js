import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl
});

export const initDatabase = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS secrets (
      id BIGSERIAL PRIMARY KEY,
      secret_type TEXT NOT NULL,
      name TEXT NOT NULL,
      encrypted_data TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_secrets_type ON secrets(secret_type)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_secrets_name ON secrets(name)
  `);
};

export const getConfigValue = async (key) => {
  const result = await pool.query('SELECT value FROM app_config WHERE key = $1 LIMIT 1', [key]);
  return result.rows[0]?.value ?? null;
};

export const setConfigValue = async (key, value) => {
  await pool.query(
    `
      INSERT INTO app_config (key, value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `,
    [key, value]
  );
};
