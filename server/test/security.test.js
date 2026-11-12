import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { loadConfig, normalizeLegacyKey } from '../src/settings.js';
import { createEncryption } from '../src/encryption.js';
import { hashSession, safeEqual, Semaphore, validName, sessionCookie } from '../src/security.js';

const key = crypto.randomBytes(32).toString('base64');
const env = {
  APP_MASTER_KEY: key,
  DATABASE_URL: 'postgres://local/test',
  APP_ORIGIN: 'https://vault.example.com',
  BOOTSTRAP_TOKEN: crypto.randomBytes(32).toString('base64')
};
test('reject empty, placeholder and insecure config', () => {
  assert.throws(() => loadConfig({}));
  assert.throws(() =>
    loadConfig({ ...env, APP_MASTER_KEY: 'please_change_master_key_32bytes_or_base64' })
  );
  assert.throws(() => loadConfig({ ...env, APP_ORIGIN: 'http://vault.example.com' }));
  assert.throws(() => loadConfig({ ...env, BOOTSTRAP_TOKEN: 'short' }));
  assert.equal(loadConfig(env).secureCookie, true);
});
test('login cookies and default session limits persist for seven days', () => {
  const config = loadConfig(env);
  assert.equal(config.sessionSeconds, 7 * 24 * 60 * 60);
  assert.equal(config.idleSeconds, 7 * 24 * 60 * 60);
  assert.deepEqual(sessionCookie(config), {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 604800
  });
  const extended = loadConfig({
    ...env,
    SESSION_SECONDS: '2592000',
    SESSION_IDLE_SECONDS: '2592000'
  });
  assert.equal(extended.sessionSeconds, 2592000);
  assert.equal(extended.idleSeconds, 2592000);
});
test('old AES-GCM ciphertext and normalization remain readable; v2 resists tampering', () => {
  const legacyKey = normalizeLegacyKey('old private passphrase');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', legacyKey, iv);
  const value = { password: 'test-only', contentBase64: 'aGVsbG8=' };
  const ct = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  const legacy = JSON.stringify({
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ct: ct.toString('base64')
  });
  const service = createEncryption(
    loadConfig({ ...env, APP_LEGACY_MASTER_KEY: 'old private passphrase' })
  );
  assert.deepEqual(service.decrypt(legacy), value);
  const encrypted = service.encrypt(value);
  assert.equal(JSON.parse(encrypted).v, 2);
  assert.deepEqual(service.decrypt(encrypted), value);
  assert.notEqual(encrypted, service.encrypt(value));
  const changed = JSON.parse(encrypted);
  changed.kid = 'unknown';
  assert.throws(() => service.decrypt(JSON.stringify(changed)));
  const broken = JSON.parse(encrypted);
  const bytes = Buffer.from(broken.ct, 'base64');
  bytes[0] ^= 1;
  broken.ct = bytes.toString('base64');
  assert.throws(() => service.decrypt(JSON.stringify(broken)));
});
test('session tokens are one-way hashed and names reject path traversal', () => {
  assert.equal(hashSession('token').length, 64);
  assert.notEqual(hashSession('token'), 'token');
  assert.equal(safeEqual('a', 'b'), false);
  assert.equal(safeEqual('a', 'a'), true);
  for (const name of ['../x', '..', 'a/b', 'a\\b', '\u0000', ''])
    assert.equal(validName(name), false);
  assert.equal(validName('配置 env.txt'), true);
});
test('Argon2 concurrency is bounded and released after failure', async () => {
  const semaphore = new Semaphore(2, 4);
  let active = 0;
  let peak = 0;
  await Promise.all(
    Array.from({ length: 6 }, () =>
      semaphore.run(async () => {
        peak = Math.max(peak, ++active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
      })
    )
  );
  assert.equal(peak, 2);
  await assert.rejects(
    semaphore.run(async () => {
      throw new Error('test');
    })
  );
  assert.equal(await semaphore.run(async () => 42), 42);
});
