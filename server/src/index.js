import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { config } from './config.js';
import { initDatabase, pool } from './db.js';
import { bootstrapPassword, getBootstrapState, verifyPassword } from './auth.js';
import { decryptJson, encryptJson } from './crypto.js';

const app = Fastify({ logger: true });
const SECRET_TYPES = new Set(['apikey', 'ssh', 'password', 'database', 'custom', 'long_text', 'config_file']);

const hasAnyValue = (value) => {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasAnyValue(item));
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some((item) => hasAnyValue(item));
  }
  return value !== null && value !== undefined;
};

const buildDefaultName = () => {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  return `未命名-${date}-${time}`;
};

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

app.get('/api/auth/session', { preHandler: [app.authenticate] }, async () => ({ ok: true }));

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
      SELECT id, secret_type, name, encrypted_data, note, created_at, updated_at
      FROM secrets
      ${whereSql}
      ORDER BY updated_at DESC
    `,
    values
  );

  return result.rows.map((row) => {
    let preview = '***';
    try {
      const data = decryptJson(row.encrypted_data);
      if (row.secret_type === 'config_file') {
        const fileName = typeof data.fileName === 'string' ? data.fileName : '未命名文件';
        const size = Number.isFinite(Number(data.size)) ? Number(data.size) : 0;
        preview = `${fileName} (${size} bytes)`;
      } else if (row.secret_type === 'long_text') {
        const content = typeof data.content === 'string' ? data.content : '';
        preview = content.trim() ? content.slice(0, 36) : '无内容';
      } else {
        const firstValue = Object.values(data).find((v) => typeof v === 'string' && v.trim());
        preview = firstValue ? String(firstValue).slice(0, 36) : '无内容';
      }
    } catch {
      preview = '***';
    }

    return {
      id: Number(row.id),
      secret_type: row.secret_type,
      name: row.name,
      note: row.note,
      created_at: row.created_at,
      updated_at: row.updated_at,
      preview
    };
  });
});

app.post('/api/secrets', { preHandler: [app.authenticate] }, async (request, reply) => {
  const { secret_type, name, data, note = '' } = request.body || {};

  if (!SECRET_TYPES.has(secret_type)) {
    return reply.code(400).send({ message: '不支持的密钥类型' });
  }
  const normalizedData = data && typeof data === 'object' ? data : {};
  const normalizedName = String(name || '').trim();
  const normalizedNote = String(note || '').trim();
  if (!hasAnyValue(normalizedData) && !normalizedName && !normalizedNote) {
    return reply.code(400).send({ message: '请至少填写一个字段' });
  }

  const encrypted = encryptJson(normalizedData);
  const result = await pool.query(
    `
      INSERT INTO secrets (secret_type, name, encrypted_data, note)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `,
    [secret_type, normalizedName || buildDefaultName(), encrypted, normalizedNote]
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
      SELECT id, secret_type, name, encrypted_data, note, created_at, updated_at
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
    created_at: row.created_at,
    updated_at: row.updated_at
  };
});

app.put('/api/secrets/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
  const id = Number(request.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return reply.code(400).send({ message: '无效的 ID' });
  }

  const { secret_type, name, data, note = '' } = request.body || {};
  if (!SECRET_TYPES.has(secret_type)) {
    return reply.code(400).send({ message: '不支持的密钥类型' });
  }

  const normalizedData = data && typeof data === 'object' ? data : {};
  const normalizedName = String(name || '').trim();
  const normalizedNote = String(note || '').trim();
  if (!hasAnyValue(normalizedData) && !normalizedName && !normalizedNote) {
    return reply.code(400).send({ message: '请至少填写一个字段' });
  }

  const encrypted = encryptJson(normalizedData);
  const result = await pool.query(
    `
      UPDATE secrets
      SET secret_type = $1,
          name = $2,
          encrypted_data = $3,
          note = $4,
          updated_at = NOW()
      WHERE id = $5
    `,
    [secret_type, normalizedName || buildDefaultName(), encrypted, normalizedNote, id]
  );

  if (result.rowCount === 0) {
    return reply.code(404).send({ message: '记录不存在' });
  }

  return { ok: true };
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
