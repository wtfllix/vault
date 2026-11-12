import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';

test(
  'PostgreSQL security and workspace integration (isolated empty test database only)',
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    if (process.env.VAULT_TEST_DEBUG) {
      const original = pg.Client.prototype.query;
      pg.Client.prototype.query = function (...args) {
        const result = original.apply(this, args);
        return result?.catch
          ? result.catch((e) => {
              console.error('synthetic fixture SQL error:', e.code, e.message);
              throw e;
            })
          : result;
      };
    }
    const { buildApp } = await import('../src/app.js');
    const { loadConfig } = await import('../src/settings.js');
    const admin = new pg.Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      connectionTimeoutMillis: 5000
    });
    const schema = `vault_test_${crypto.randomBytes(8).toString('hex')}`;
    await admin.query(`CREATE SCHEMA ${schema}`);
    const database = new URL(process.env.TEST_DATABASE_URL);
    database.searchParams.set('options', `-csearch_path=${schema}`);
    let app;
    t.after(async () => {
      await app?.close();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    });
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-test-'));
    const config = loadConfig({
      APP_MASTER_KEY: crypto.randomBytes(32).toString('base64'),
      BOOTSTRAP_TOKEN: crypto.randomBytes(32).toString('base64'),
      DATABASE_URL: database.toString(),
      APP_ORIGIN: 'https://vault.test',
      STORAGE_ROOT: root,
      DISK_RESERVE_BYTES: '0'
    });
    const fixturePool = new pg.Pool({ connectionString: database.toString() });
    const oldKeyText = 'old-migration-fixture-key';
    config.legacyKeys.push(crypto.createHash('sha256').update(oldKeyText).digest());
    const oldIv = crypto.randomBytes(12);
    const oldCipher = crypto.createCipheriv('aes-256-gcm', config.legacyKeys.at(-1), oldIv);
    const oldData = { key: 'legacy-key-value', apiUrl: '', vaultEnvelope: 2 };
    const oldCt = Buffer.concat([oldCipher.update(JSON.stringify(oldData)), oldCipher.final()]);
    const oldText = JSON.stringify({
      iv: oldIv.toString('base64'),
      tag: oldCipher.getAuthTag().toString('base64'),
      ct: oldCt.toString('base64')
    });
    await fixturePool.query(
      `CREATE TABLE secrets (id BIGSERIAL PRIMARY KEY,secret_type TEXT NOT NULL,name TEXT NOT NULL,encrypted_data TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`
    );
    await fixturePool.query(
      "INSERT INTO secrets(secret_type,name,encrypted_data,note) VALUES ('apikey','legacy fixture',$1,'old-private-note')",
      [oldText]
    );
    await fixturePool.end();
    app = await buildApp({ config, logger: Boolean(process.env.VAULT_TEST_DEBUG) });
    t.after(async () => {
      await fs.rm(root, { recursive: true, force: true });
    });
    const headers = { origin: config.origin };
    const send = (method, url, payload, extra = {}) =>
      app.inject({ method, url, payload, headers: { ...headers, ...extra } });
    assert.equal((await send('POST', '/api/notes', { unexpected: true })).statusCode, 401);
    const ownerPassword = 'correct-test-password';
    const init = { password: ownerPassword, bootstrapToken: config.bootstrapToken };
    assert.equal(
      (await send('POST', '/api/auth/bootstrap', init, { origin: 'https://evil.test' })).statusCode,
      403
    );
    const race = await Promise.all([
      send('POST', '/api/auth/bootstrap', init),
      send('POST', '/api/auth/bootstrap', init)
    ]);
    assert.deepEqual(race.map((r) => r.statusCode).sort(), [200, 409]);
    const winner = race.find((r) => r.statusCode === 200);
    const rawCookie = winner.headers['set-cookie'];
    assert.match(rawCookie, /HttpOnly/);
    assert.match(rawCookie, /Secure/);
    assert.match(rawCookie, /SameSite=Strict/i);
    let cookie = rawCookie.split(';')[0];
    let csrf = winner.json().csrf;
    const auth = () => ({ cookie, 'x-csrf-token': csrf });
    const migrated = await send('GET', '/api/secrets/1', undefined, auth());
    assert.equal(migrated.statusCode, 200);
    assert.deepEqual(migrated.json().data, oldData);
    assert.equal(migrated.json().note, 'old-private-note');
    assert.equal((await app.pool.query('SELECT note FROM secrets WHERE id=1')).rows[0].note, '');
    assert.equal(
      (await send('POST', '/api/auth/login', { password: [ownerPassword] })).statusCode,
      400
    );

    const tokenHash = crypto
      .createHash('sha256')
      .update(decodeURIComponent(cookie.split('=')[1]))
      .digest('hex');
    assert.equal(
      (await app.pool.query('SELECT 1 FROM sessions WHERE token_hash=$1', [tokenHash])).rowCount,
      1
    );
    assert.equal(
      (
        await send(
          'POST',
          '/api/secrets',
          {
            secret_type: 'apikey',
            name: 'fixture',
            data: { key: 'never-list-this' },
            note: 'private-note'
          },
          auth()
        )
      ).statusCode,
      200
    );
    const list = (await send('GET', '/api/secrets', undefined, auth())).json();
    assert.equal(JSON.stringify(list).includes('never-list-this'), false);
    assert.equal(JSON.stringify(list).includes('private-note'), false);
    assert.equal('encrypted_data' in list.items[0], false);
    assert.equal(
      (
        await send(
          'POST',
          '/api/notes',
          { title: 'test', language: 'markdown', content: '' },
          { cookie }
        )
      ).statusCode,
      403
    );
    const note = (
      await send('POST', '/api/notes', { title: 'test', language: 'markdown', content: '' }, auth())
    ).json();
    const edits = await Promise.all(
      ['A', 'B'].map((content) =>
        send(
          'PUT',
          `/api/notes/${note.id}`,
          { title: 'test', language: 'markdown', content, version: 1 },
          auth()
        )
      )
    );
    assert.deepEqual(edits.map((r) => r.statusCode).sort(), [200, 409]);
    const folder = (
      await send('POST', '/api/files/folders', { name: 'folder', parent_id: null }, auth())
    ).json();
    assert.equal(
      (await send('POST', '/api/files/folders', { name: '../escape', parent_id: null }, auth()))
        .statusCode,
      400
    );
    const child = await send(
      'POST',
      '/api/files/folders',
      { name: 'child', parent_id: folder.id },
      auth()
    );
    assert.equal(child.statusCode, 200);
    assert.equal(
      (await send('PATCH', `/api/files/${folder.id}`, { parent_id: child.json().id }, auth()))
        .statusCode,
      400
    );
    const boundary = 'test-vault-boundary';
    const multipart = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="hello.txt"\r\nContent-Type: text/plain\r\n\r\nhello world\r\n--${boundary}--\r\n`
    );
    const uploaded = await send('POST', `/api/files/upload?parent_id=${folder.id}`, multipart, {
      ...auth(),
      'content-type': `multipart/form-data; boundary=${boundary}`
    });
    assert.equal(uploaded.statusCode, 200, uploaded.body);
    const file = uploaded.json();
    assert.equal((await send('GET', `/api/files/${file.id}/download`)).statusCode, 401);
    const download = await send('GET', `/api/files/${file.id}/download`, undefined, auth());
    assert.equal(download.statusCode, 200);
    assert.match(download.headers['x-accel-redirect'], /^\/_private_objects\/[a-f0-9-]+$/);
    assert.equal(
      await fs.readFile(path.join(root, 'objects', file.storage_key), 'utf8'),
      'hello world'
    );
    assert.equal(
      (
        await send('POST', `/api/files/upload?parent_id=${folder.id}`, multipart, {
          ...auth(),
          'content-type': `multipart/form-data; boundary=${boundary}`
        })
      ).statusCode,
      409
    );
    assert.equal(
      (await send('DELETE', `/api/files/${folder.id}`, undefined, auth())).statusCode,
      200
    );
    assert.equal(
      (await send('GET', `/api/files/${file.id}/download`, undefined, auth())).statusCode,
      404
    );
    assert.equal(
      (await send('POST', `/api/files/${folder.id}/restore`, {}, auth())).statusCode,
      200
    );
    assert.equal(
      (await send('GET', `/api/files/${file.id}/download`, undefined, auth())).statusCode,
      200
    );
    await app.close();
    app = await buildApp({ config, logger: Boolean(process.env.VAULT_TEST_DEBUG) });
    assert.equal((await send('GET', '/api/auth/session', undefined, { cookie })).statusCode, 200);
    assert.equal((await send('POST', '/api/auth/logout', {}, auth())).statusCode, 200);
    assert.equal((await send('GET', '/api/auth/session', undefined, { cookie })).statusCode, 401);
    await app.close();
    app = await buildApp({ config, logger: Boolean(process.env.VAULT_TEST_DEBUG) });
    assert.equal((await send('GET', '/api/auth/session', undefined, { cookie })).statusCode, 401);
    const login = await send('POST', '/api/auth/login', { password: ownerPassword });
    cookie = login.headers['set-cookie'].split(';')[0];
    csrf = login.json().csrf;
    assert.equal(
      (
        await send(
          'POST',
          '/api/auth/password',
          { currentPassword: ownerPassword, newPassword: 'changed-test-password' },
          auth()
        )
      ).statusCode,
      200
    );
    assert.equal((await send('GET', '/api/auth/session', undefined, { cookie })).statusCode, 401);
    await app.pool.query('DELETE FROM auth_limits');
    const newLogin = await send('POST', '/api/auth/login', { password: 'changed-test-password' });
    cookie = newLogin.headers['set-cookie'].split(';')[0];
    csrf = newLogin.json().csrf;
    await app.pool.query(
      "UPDATE sessions SET verified_at=NOW()-INTERVAL '10 minutes' WHERE revoked_at IS NULL"
    );
    assert.equal((await send('GET', '/api/secrets/1', undefined, auth())).statusCode, 428);
    assert.equal(
      (await send('POST', '/api/auth/reauth', { password: 'changed-test-password' }, auth()))
        .statusCode,
      200
    );
    assert.equal((await send('GET', '/api/secrets/1', undefined, auth())).statusCode, 200);
    const heartbeatBefore = (
      await app.pool.query(
        'SELECT last_seen_at::text AS value FROM sessions WHERE revoked_at IS NULL ORDER BY created_at DESC LIMIT 1'
      )
    ).rows[0].value;
    assert.equal((await send('GET', '/api/auth/session', undefined, auth())).statusCode, 200);
    const heartbeatAfter = (
      await app.pool.query(
        'SELECT last_seen_at::text AS value FROM sessions WHERE revoked_at IS NULL ORDER BY created_at DESC LIMIT 1'
      )
    ).rows[0].value;
    assert.equal(heartbeatAfter, heartbeatBefore);
    assert.equal((await send('POST', '/api/auth/logout-all', {}, auth())).statusCode, 200);
    assert.equal((await send('GET', '/api/auth/session', undefined, auth())).statusCode, 401);
    await app.pool.query(
      "INSERT INTO secrets(secret_type,name,encrypted_data) VALUES ('custom','unconverted legacy',$1)",
      [oldText]
    );
    await assert.rejects(
      buildApp({ config: { ...config, legacyKeys: [...config.keys.values()] }, logger: false })
    );
    await app.pool.query('DELETE FROM auth_limits');
    for (let i = 0; i < 12; i++)
      await send('POST', '/api/auth/login', { password: 'wrong-password' });
    assert.equal(
      (await send('POST', '/api/auth/login', { password: 'wrong-password' })).statusCode,
      429
    );
    await app.close();
    app = await buildApp({ config, logger: false });
    assert.equal(
      (await send('POST', '/api/auth/login', { password: 'wrong-password' })).statusCode,
      429
    );
    await app.pool.query('DELETE FROM auth_limits');
    for (let i = 0; i < 4; i++)
      assert.equal(
        (
          await send(
            'POST',
            '/api/auth/login',
            { password: 'wrong-password' },
            { 'x-forwarded-for': `192.0.2.${i + 1}` }
          )
        ).statusCode,
        401
      );
    assert.equal(
      (
        await send(
          'POST',
          '/api/auth/login',
          { password: 'wrong-password' },
          { 'x-forwarded-for': '192.0.2.20' }
        )
      ).statusCode,
      429
    );
    await app.pool.query('DELETE FROM auth_limits');
    const expiring = await send('POST', '/api/auth/login', { password: 'changed-test-password' });
    cookie = expiring.headers['set-cookie'].split(';')[0];
    csrf = expiring.json().csrf;
    await app.pool.query(
      "UPDATE sessions SET last_seen_at=NOW()-INTERVAL '1 day' WHERE revoked_at IS NULL"
    );
    assert.equal((await send('GET', '/api/auth/session', undefined, auth())).statusCode, 401);
  }
);
