import argon2 from 'argon2';
import { config } from './config.js';
import { getConfigValue, setConfigValue } from './db.js';

const MASTER_PASSWORD_KEY = 'master_password_hash';

const argon2Options = {
  type: argon2.argon2id,
  memoryCost: config.argon2MemoryCost,
  timeCost: config.argon2TimeCost,
  parallelism: config.argon2Parallelism
};

export const getBootstrapState = async () => {
  const hash = await getConfigValue(MASTER_PASSWORD_KEY);
  return { initialized: Boolean(hash) };
};

export const bootstrapPassword = async (password) => {
  const state = await getBootstrapState();
  if (state.initialized) {
    throw new Error('系统已初始化，不能重复设置主密码');
  }

  const hash = await argon2.hash(password, argon2Options);
  await setConfigValue(MASTER_PASSWORD_KEY, hash);
};

export const verifyPassword = async (password) => {
  const hash = await getConfigValue(MASTER_PASSWORD_KEY);
  if (!hash) {
    throw new Error('系统未初始化，请先设置主密码');
  }
  return argon2.verify(hash, password);
};
