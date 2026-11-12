import { buildApp } from './app.js';
import { loadConfig } from './settings.js';
try {
  const config = loadConfig();
  const app = await buildApp({ config });
  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  await app.listen({ port: config.port, host: '0.0.0.0' });
} catch {
  console.error('Vault 启动失败。请检查配置、数据库连接和旧密钥兼容配置；未输出敏感错误详情。');
  process.exitCode = 1;
}
