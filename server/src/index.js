import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { config } from './config.js';
import { initDatabase, pool } from './db.js';
import { bootstrapPassword, getBootstrapState, verifyPassword } from './auth.js';
import { decryptJson, encryptJson } from './crypto.js';

const app = Fastify({ logger: true });
const SECRET_TYPES = new Set(['apikey', 'ssh', 'password', 'database', 'custom']);

await app.register(cors, {
  origin: true
});

await app.register(jwt, {
  secret: config.jwtSecret
});

app.decorate('authenticate', async (request, reply) => {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ message: '未授权访问' });
  }
});

app.get('/api/health', async () => ({ ok: true }));

app.get('/api/auth/state', async () => getBootstrapState());

app.post('/api/auth/bootstrap', async (request, reply) => {
  const { password } = request.body || {};
  if (!password || password.length < 8) {
    return reply.code(400).send({ message: '主密码至少 8 位' });
  }

  try {
    await bootstrapPassword(password);
    const token = await reply.jwtSign({ role: 'owner' }, { expiresIn: config.jwtExpiresIn });
    return { token };
  } catch (error) {
    return reply.code(409).send({ message: error.message || '初始化失败' });
  }
});

app.post('/api/auth/login', async (request, reply) => {
  const { password } = request.body || {};
  if (!password) {
    return reply.code(400).send({ message: '请输入主密码' });
  }

  try {
    const valid = await verifyPassword(password);
    if (!valid) {
      return reply.code(401).send({ message: '主密码错误' });
    }
    const token = await reply.jwtSign({ role: 'owner' }, { expiresIn: config.jwtExpiresIn });
    return { token };
  } catch (error) {
    return reply.code(400).send({ message: error.message || '登录失败' });
  }
});

app.post('/api/auth/logout', async () => ({ ok: true }));

app.get('/api/secrets', { preHandler: [app.authenticate] }, async (request) => {
  const query = String(request.query?.query || '').trim().toLowerCase();
  const type = String(request.query?.type || '').trim().toLowerCase();
  const values = [];
  const where = [];

  if (query) {
    values.push(`%${query}%`);
    where.push(`(LOWER(name) LIKE $${values.length} OR LOWER(secret_type) LIKE $${values.length})`);
  }

  if (type && SECRET_TYPES.has(type)) {
    values.push(type);
    where.push(`secret_type = $${values.length}`);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const result = await pool.query(
    `
      SELECT id, secret_type, name, encrypted_data, note, created_at
      FROM secrets
      ${whereSql}
      ORDER BY created_at DESC
    `,
    values
  );

  return result.rows.map((row) => {
    let preview = '***';
    try {
      const data = decryptJson(row.encrypted_data);
      const firstValue = Object.values(data).find((v) => typeof v === 'string' && v.trim());
      preview = firstValue ? String(firstValue).slice(0, 36) : '无内容';
    } catch {
      preview = '***';
    }

    return {
      id: Number(row.id),
      secret_type: row.secret_type,
      name: row.name,
      note: row.note,
      created_at: row.created_at,
      preview
    };
  });
});

app.post('/api/secrets', { preHandler: [app.authenticate] }, async (request, reply) => {
  const { secret_type, name, data, note = '' } = request.body || {};

  if (!SECRET_TYPES.has(secret_type)) {
    return reply.code(400).send({ message: '不支持的密钥类型' });
  }
  if (!name || !String(name).trim()) {
    return reply.code(400).send({ message: '名称不能为空' });
  }
  if (!data || typeof data !== 'object') {
    return reply.code(400).send({ message: '密钥内容格式不正确' });
  }

  const encrypted = encryptJson(data);
  const result = await pool.query(
    `
      INSERT INTO secrets (secret_type, name, encrypted_data, note)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `,
    [secret_type, String(name).trim(), encrypted, String(note)]
  );

  return { id: Number(result.rows[0].id) };
});

app.get('/api/secrets/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
  const id = Number(request.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return reply.code(400).send({ message: '无效的 ID' });
  }

  const result = await pool.query(
    `
      SELECT id, secret_type, name, encrypted_data, note, created_at
      FROM secrets
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );

  if (result.rows.length === 0) {
    return reply.code(404).send({ message: '记录不存在' });
  }

  const row = result.rows[0];
  return {
    id: Number(row.id),
    secret_type: row.secret_type,
    name: row.name,
    data: decryptJson(row.encrypted_data),
    note: row.note,
    created_at: row.created_at
  };
});

app.delete('/api/secrets/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
  const id = Number(request.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return reply.code(400).send({ message: '无效的 ID' });
  }

  const result = await pool.query('DELETE FROM secrets WHERE id = $1', [id]);
  if (result.rowCount === 0) {
    return reply.code(404).send({ message: '记录不存在' });
  }

  return { ok: true };
});

const start = async () => {
  try {
    await initDatabase();
    await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info(`API listening on ${config.port}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

start();
