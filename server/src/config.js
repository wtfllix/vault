import crypto from 'node:crypto';

const DEFAULT_PORT = 8787;
const DEFAULT_JWT_EXPIRES_IN = '7d';
const DEFAULT_ARGON2_MEMORY_COST = 19456;
const DEFAULT_ARGON2_TIME_COST = 2;
const DEFAULT_ARGON2_PARALLELISM = 1;

const normalizeMasterKey = (raw) => {
  if (!raw || !raw.trim()) {
    throw new Error('APP_MASTER_KEY 未配置');
  }

  const trimmed = raw.trim();
  let keyBuffer;

  try {
    keyBuffer = Buffer.from(trimmed, 'base64');
  } catch {
    keyBuffer = Buffer.from(trimmed, 'utf8');
  }

  if (keyBuffer.length !== 32) {
    keyBuffer = crypto.createHash('sha256').update(trimmed).digest();
  }

  return keyBuffer;
};

export const config = {
  port: Number(process.env.PORT || DEFAULT_PORT),
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || DEFAULT_JWT_EXPIRES_IN,
  masterKey: normalizeMasterKey(process.env.APP_MASTER_KEY || ''),
  argon2MemoryCost: Number(process.env.ARGON2_MEMORY_COST || DEFAULT_ARGON2_MEMORY_COST),
  argon2TimeCost: Number(process.env.ARGON2_TIME_COST || DEFAULT_ARGON2_TIME_COST),
  argon2Parallelism: Number(process.env.ARGON2_PARALLELISM || DEFAULT_ARGON2_PARALLELISM)
};

if (!config.databaseUrl) {
  throw new Error('DATABASE_URL 未配置');
}

if (!config.jwtSecret) {
  throw new Error('JWT_SECRET 未配置');
}
