import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { loadConfig } from './settings.js';
import { makePool, migrate } from './database.js';
import { createEncryption } from './encryption.js';
import { registerAuth } from './auth.js';
import { registerSecrets } from './routes/secrets.js';
import { registerFiles } from './routes/files.js';
import { registerNotes } from './routes/notes.js';
import { registerRecent } from './routes/recent.js';
import { createStorage } from './storage.js';
import { fail } from './security.js';

export const buildApp = async ({
  config = loadConfig(),
  pool = makePool(config),
  logger = true
} = {}) => {
  const app = Fastify({
    logger: logger
      ? {
          redact: [
            'req.headers.cookie',
            'req.headers.authorization',
            'req.headers.x-csrf-token',
            'res.headers.set-cookie'
          ]
        }
      : false,
    disableRequestLogging: true,
    bodyLimit: 16 * 1024 * 1024,
    trustProxy: 1,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } }
  });
  app.decorate('pool', pool);
  app.addHook('onClose', async () => {
    await pool.end();
  });
  app.setErrorHandler((error, request, reply) => {
    let status = error.validation ? 400 : error.statusCode || 500;
    if (error.code === '23505') status = 409;
    if (error.code === '23514' || error.code === '23503') status = 400;
    const message = error.validation
      ? '输入格式不正确，请检查字段类型和长度'
      : error.code === '23505'
        ? '同名记录已存在，请重命名后重试'
        : status >= 500
          ? '服务暂时不可用，请稍后重试'
          : ['23514', '23503'].includes(error.code)
            ? '文件夹或文件名称无效'
            : error.message;
    if (status >= 500)
      app.log.error({ requestId: request.id, code: error.code || 'INTERNAL' }, 'request failed');
    reply.code(status).send({ message });
  });
  app.addHook('onRequest', async (request, reply) => {
    reply
      .header('Cache-Control', 'no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Referrer-Policy', 'no-referrer');
    const origin = request.headers.origin;
    if ((origin && origin !== config.origin) || request.headers['sec-fetch-site'] === 'cross-site')
      throw fail(403, '不允许跨站访问');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && origin !== config.origin)
      throw fail(403, '缺少有效 Origin');
  });
  app.addHook('preValidation', async (request) => {
    const properties = request.routeOptions.schema?.querystring?.properties || {};
    for (const [key, spec] of Object.entries(properties)) {
      const value = request.query?.[key];
      if (typeof value !== 'string') continue;
      if (spec.type === 'boolean' && ['true', 'false'].includes(value))
        request.query[key] = value === 'true';
      if (spec.type === 'integer' && /^\d+$/.test(value)) request.query[key] = Number(value);
    }
  });
  await app.register(cookie);
  const publicPaths = new Set([
    '/api/health',
    '/api/auth/state',
    '/api/auth/login',
    '/api/auth/bootstrap'
  ]);
  // Reject unauthenticated private requests before buffering or parsing their bodies.
  app.addHook('onRequest', async (request) => {
    const route = request.routeOptions.url;
    if (route?.startsWith('/api/') && !publicPaths.has(route)) await app.authenticate(request);
  });
  await app.register(multipart, {
    limits: { fileSize: config.maxFileSize, files: 1, fields: 0, parts: 1 }
  });
  const encryption = createEncryption(config);
  try {
    await migrate(pool, encryption);
    const storage = await createStorage(config);
    await registerAuth(app, config, pool);
    await registerRecent(app, { pool });
    await registerSecrets(app, { pool, encryption });
    await registerFiles(app, { pool, storage, config });
    await registerNotes(app, { pool, encryption });
    app.get('/api/health', async () => {
      await pool.query('SELECT 1');
      return { ok: true };
    });
    app.get(
      '/api/search',
      {
        preHandler: [app.authenticate],
        schema: {
          querystring: {
            type: 'object',
            additionalProperties: false,
            properties: { q: { type: 'string', maxLength: 200, default: '' } }
          }
        }
      },
      async (request) => {
        const r = await pool.query(
          `(SELECT id::text,name AS title,'files' AS module FROM files WHERE deleted_at IS NULL AND status='ready' AND name ILIKE '%'||$1||'%' LIMIT 10)
        UNION ALL (SELECT id::text,title,'notes' AS module FROM notes WHERE deleted_at IS NULL AND title ILIKE '%'||$1||'%' LIMIT 10)
        UNION ALL (SELECT id::text,name AS title,'secrets' AS module FROM secrets WHERE deleted_at IS NULL AND name ILIKE '%'||$1||'%' LIMIT 10)`,
          [request.query.q]
        );
        return r.rows;
      }
    );
    await app.ready();
    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
};
