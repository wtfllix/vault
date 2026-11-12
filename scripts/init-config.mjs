import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const origin = process.argv[2];
if (!origin || new URL(origin).protocol !== 'https:' || new URL(origin).origin !== origin)
  throw new Error('Usage: node scripts/init-config.mjs https://vault.example.com');
const password = crypto.randomBytes(32).toString('hex');
const text = `APP_ORIGIN=${origin}\nPOSTGRES_DB=akv\nPOSTGRES_USER=akv\nPOSTGRES_PASSWORD=${password}\nDATABASE_URL=postgres://akv:${password}@db:5432/akv\nAPP_MASTER_KEY=${crypto.randomBytes(32).toString('base64')}\nBOOTSTRAP_TOKEN=${crypto.randomBytes(32).toString('base64')}\nAPP_PREVIOUS_KEYS=[]\nWEB_PORT=8080\n`;
try {
  await fs.writeFile('.env', text, { flag: 'wx', mode: 0o600 });
  console.log('.env 已创建（0600）。初始化凭据位于 BOOTSTRAP_TOKEN；完成初始化后可移除此变量。');
} catch (error) {
  if (error.code === 'EEXIST') {
    console.error('.env 已存在，拒绝覆盖。旧数据部署请按迁移说明操作。');
    process.exitCode = 1;
  } else throw error;
}
