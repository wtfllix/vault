import { loadConfig } from './settings.js';
import { createEncryption } from './encryption.js';
import { makePool, migrate } from './database.js';
const config = loadConfig();
const pool = makePool(config);
try {
  await migrate(pool, createEncryption(config));
  console.log('数据库迁移和密文兼容验证完成');
} catch {
  console.error('迁移失败，事务已回滚；请检查数据库及密钥配置');
  process.exitCode = 1;
} finally {
  await pool.end();
}
