import pg from 'pg';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
export const makePool = (config) =>
  new pg.Pool({
    connectionString: config.databaseUrl,
    max: 8,
    connectionTimeoutMillis: 5000,
    statement_timeout: 30000
  });
export const transaction = async (pool, fn, lock = null) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (lock !== null) await client.query('SELECT pg_advisory_xact_lock($1)', [lock]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
export const migrate = async (pool, encryption) =>
  transaction(
    pool,
    async (client) => {
      await client.query(
        'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())'
      );
      const directory = fileURLToPath(new URL('../migrations/', import.meta.url));
      for (const name of (await fs.readdir(directory))
        .filter((n) => /^\d+.*\.sql$/.test(n))
        .sort()) {
        if ((await client.query('SELECT 1 FROM schema_migrations WHERE name=$1', [name])).rowCount)
          continue;
        await client.query(await fs.readFile(`${directory}/${name}`, 'utf8'));
        await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [name]);
      }
      // Validate every record, including trash, before accepting traffic. No key guessing or key generation.
      for (const table of ['secrets', 'notes', 'note_drafts']) {
        const result = await client.query(`SELECT encrypted_data FROM ${table}`);
        for (const row of result.rows) encryption.decrypt(row.encrypted_data);
      }
      const legacy = await client.query(
        "SELECT id, encrypted_data, note FROM secrets WHERE note <> ''"
      );
      for (const row of legacy.rows) {
        const payload = encryption.decrypt(row.encrypted_data);
        const envelope =
          JSON.parse(row.encrypted_data).v === 2 && payload?.vaultEnvelope === 2
            ? payload
            : { vaultEnvelope: 2, data: payload, note: row.note };
        await client.query("UPDATE secrets SET encrypted_data=$1, note='' WHERE id=$2", [
          encryption.encrypt(envelope),
          row.id
        ]);
      }
    },
    72002000
  );
