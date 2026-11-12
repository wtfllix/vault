import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import pg from 'pg';
import { buildApp } from '../server/src/app.js';
import { loadConfig } from '../server/src/settings.js';
if (!process.env.TEST_DATABASE_URL)
  throw new Error('Set TEST_DATABASE_URL to run isolated end-to-end tests');
const admin = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  connectionTimeoutMillis: 5000
});
const schema = `vault_e2e_${crypto.randomBytes(8).toString('hex')}`;
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-e2e-'));
const db = new URL(process.env.TEST_DATABASE_URL);
db.searchParams.set('options', `-csearch_path=${schema}`);
let app;
let nginx;
let closing = false;
const shutdown = async () => {
  if (closing) return;
  closing = true;
  if (nginx && !nginx.killed) {
    nginx.kill('SIGTERM');
    await new Promise((resolve) => {
      nginx.once('exit', resolve);
      setTimeout(resolve, 2000);
    });
  }
  await app?.close();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
  await fs.rm(root, { recursive: true, force: true });
  await fs.rm('.tmp/e2e.json', { force: true });
};
process.once('SIGTERM', () => shutdown().then(() => process.exit()));
process.once('SIGINT', () => shutdown().then(() => process.exit()));
try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  const config = loadConfig({
    NODE_ENV: 'development',
    APP_ORIGIN: 'http://127.0.0.1:4173',
    DATABASE_URL: db.toString(),
    APP_MASTER_KEY: crypto.randomBytes(32).toString('base64'),
    BOOTSTRAP_TOKEN: crypto.randomBytes(32).toString('base64'),
    STORAGE_ROOT: path.join(root, 'storage'),
    DISK_RESERVE_BYTES: '0'
  });
  app = await buildApp({ config, logger: false });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const port = app.server.address().port;
  let conf = await fs.readFile('nginx.conf', 'utf8');
  conf = conf
    .replace('listen 80;', 'listen 127.0.0.1:4173;')
    .replace('/usr/share/nginx/html', path.resolve('dist'))
    .replace('http://api:8787', `http://127.0.0.1:${port}`)
    .replace('/srv/vault/objects/', `${config.storageRoot}/objects/`);
  await fs.mkdir(path.join(root, 'body'));
  await fs.mkdir(path.join(root, 'proxy'));
  const full = `daemon off;\npid ${root}/nginx.pid;\nerror_log ${root}/error.log warn;\nevents { worker_connections 256; }\nhttp { include /etc/nginx/mime.types; access_log off; client_body_temp_path ${root}/body; proxy_temp_path ${root}/proxy; ${conf} }`;
  const file = path.join(root, 'nginx.conf');
  await fs.writeFile(file, full);
  await fs.mkdir('.tmp', { recursive: true });
  await fs.writeFile(
    '.tmp/e2e.json',
    JSON.stringify({ bootstrapToken: config.bootstrapToken, schema }),
    { mode: 0o600 }
  );
  nginx = spawn('nginx', ['-c', file, '-p', root], { stdio: ['ignore', 'inherit', 'inherit'] });
  nginx.once('exit', (code) => {
    if (!closing) {
      console.error('Test Nginx exited:', code);
      shutdown().then(() => process.exit(1));
    }
  });
  console.log('Isolated Vault test stack: http://127.0.0.1:4173');
} catch (error) {
  console.error('Isolated test stack failed:', error.code || error.message);
  await shutdown();
  process.exitCode = 1;
}
