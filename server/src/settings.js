import crypto from 'node:crypto';
import path from 'node:path';

export const normalizeLegacyKey = (raw) => {
  const trimmed = raw.trim();
  const decoded = Buffer.from(trimmed, 'base64');
  return decoded.length === 32 ? decoded : crypto.createHash('sha256').update(trimmed).digest();
};
const strong = (value) =>
  typeof value === 'string' &&
  /^[A-Za-z0-9+/]{43}=$/.test(value) &&
  Buffer.from(value, 'base64').length === 32 &&
  new Set(Buffer.from(value, 'base64')).size >= 12;
const integer = (env, name, fallback, min, max) => {
  const value = Number(env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error(`${name} 配置无效`);
  return value;
};
export const loadConfig = (env = process.env) => {
  if (!strong(env.APP_MASTER_KEY))
    throw new Error(
      'APP_MASTER_KEY 必须是随机生成的 32 字节 base64 密钥；旧密钥请通过兼容迁移配置保留'
    );
  if (!env.DATABASE_URL || !/^postgres(?:ql)?:\/\//.test(env.DATABASE_URL))
    throw new Error('DATABASE_URL 未配置或格式无效');
  const origin = new URL(env.APP_ORIGIN || 'https://invalid.local');
  const development = env.NODE_ENV === 'development';
  if (
    !env.APP_ORIGIN ||
    origin.origin !== env.APP_ORIGIN ||
    (origin.protocol !== 'https:' &&
      !(
        development &&
        ['localhost', '127.0.0.1'].includes(origin.hostname) &&
        origin.protocol === 'http:'
      ))
  )
    throw new Error('APP_ORIGIN 必须是 HTTPS Origin；本地开发可显式启用 development');
  if (env.BOOTSTRAP_TOKEN && !strong(env.BOOTSTRAP_TOKEN))
    throw new Error('BOOTSTRAP_TOKEN 必须为随机 32 字节 base64');
  const masterKey = Buffer.from(env.APP_MASTER_KEY, 'base64');
  const keyId = crypto.createHash('sha256').update(masterKey).digest('hex').slice(0, 16);
  const keys = new Map([[keyId, masterKey]]);
  if (env.APP_PREVIOUS_KEYS) {
    let previous;
    try {
      previous = JSON.parse(env.APP_PREVIOUS_KEYS);
    } catch {
      throw new Error('APP_PREVIOUS_KEYS 必须为 JSON 数组');
    }
    if (!Array.isArray(previous) || previous.length > 8 || previous.some((key) => !strong(key)))
      throw new Error('APP_PREVIOUS_KEYS 格式无效');
    for (const key of previous) {
      const bytes = Buffer.from(key, 'base64');
      keys.set(crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16), bytes);
    }
  }
  const legacyKeys = [...keys.values()];
  if (env.APP_LEGACY_MASTER_KEY) legacyKeys.push(normalizeLegacyKey(env.APP_LEGACY_MASTER_KEY));
  return {
    port: integer(env, 'PORT', 8787, 1, 65535),
    databaseUrl: env.DATABASE_URL,
    origin: origin.origin,
    development,
    secureCookie: origin.protocol === 'https:',
    bootstrapToken: env.BOOTSTRAP_TOKEN || '',
    keyId,
    keys,
    legacyKeys,
    storageRoot: path.resolve(env.STORAGE_ROOT || './data/files'),
    maxFileSize: integer(env, 'MAX_FILE_SIZE', 10 * 1024 * 1024, 1, 100 * 1024 * 1024),
    storageQuota: integer(
      env,
      'STORAGE_QUOTA_BYTES',
      10 * 1024 ** 3,
      1024 ** 2,
      Number.MAX_SAFE_INTEGER
    ),
    reserveBytes: integer(env, 'DISK_RESERVE_BYTES', 256 * 1024 ** 2, 0, Number.MAX_SAFE_INTEGER),
    sessionSeconds: integer(env, 'SESSION_SECONDS', 604800, 300, 2592000),
    idleSeconds: integer(env, 'SESSION_IDLE_SECONDS', 604800, 60, 2592000),
    argon2MemoryCost: integer(env, 'ARGON2_MEMORY_COST', 19456, 19456, 262144),
    argon2TimeCost: integer(env, 'ARGON2_TIME_COST', 2, 2, 10),
    argon2Parallelism: 1
  };
};
