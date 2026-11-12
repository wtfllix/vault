import crypto from 'node:crypto';
import argon2 from 'argon2';
import { transaction } from './database.js';
import { cookieName, sessionCookie, hashSession, safeEqual, fail, Semaphore } from './security.js';
import { object, password, newPassword, text } from './schema.js';

export const registerAuth = async (app, config, pool) => {
  const semaphore = new Semaphore(2, 8);
  const options = {
    type: argon2.argon2id,
    memoryCost: config.argon2MemoryCost,
    timeCost: config.argon2TimeCost,
    parallelism: 1
  };
  const dummyHash = await semaphore.run(() => argon2.hash(crypto.randomBytes(32), options));
  const hashPassword = (value) => semaphore.run(() => argon2.hash(value, options));
  const verify = (hash, value) => semaphore.run(() => argon2.verify(hash || dummyHash, value));
  const csrf = (token) => hashSession(`csrf:${token}`);
  const limit = async (request) => {
    for (const [key, max, seconds] of [
      [`ip:${hashSession(request.ip)}`, 10, 60],
      ['owner', 40, 300]
    ]) {
      const r = await pool.query(
        `INSERT INTO auth_limits(key,attempts,reset_at,blocked_until)
        VALUES ($1,1,NOW()+$2::integer*INTERVAL '1 second',NOW())
        ON CONFLICT(key) DO UPDATE SET
          attempts=CASE WHEN auth_limits.reset_at<NOW() THEN 1 ELSE auth_limits.attempts+1 END,
          reset_at=CASE WHEN auth_limits.reset_at<NOW() THEN NOW()+$2::integer*INTERVAL '1 second' ELSE auth_limits.reset_at END,
          blocked_until=CASE WHEN auth_limits.reset_at<NOW() THEN NOW()
            WHEN auth_limits.attempts >= 4 THEN GREATEST(auth_limits.blocked_until,NOW()+LEAST(30,power(2,LEAST(auth_limits.attempts-4,5))) * INTERVAL '1 second')
            ELSE auth_limits.blocked_until END
        RETURNING attempts, blocked_until > NOW() AS blocked`,
        [key, seconds]
      );
      if (r.rows[0].attempts > max || r.rows[0].blocked)
        throw fail(429, '尝试过于频繁，请稍后重试');
    }
  };
  const issue = async (client, reply) => {
    const token = crypto.randomBytes(32).toString('base64url');
    await client.query(
      "INSERT INTO sessions(token_hash,expires_at) VALUES ($1,NOW()+$2*INTERVAL '1 second')",
      [hashSession(token), config.sessionSeconds]
    );
    reply.setCookie(cookieName(config), token, sessionCookie(config));
    return { ok: true, csrf: csrf(token) };
  };
  app.decorateRequest('session', null);
  app.decorate('authenticate', async (request) => {
    if (request.session) return;
    const raw = request.cookies[cookieName(config)];
    if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw)) throw fail(401, '请登录 Vault');
    const result = await pool.query(
      `UPDATE sessions SET last_seen_at=CASE WHEN $3::boolean THEN last_seen_at ELSE NOW() END WHERE token_hash=$1 AND revoked_at IS NULL
      AND expires_at>NOW() AND last_seen_at>NOW()-$2*INTERVAL '1 second' RETURNING token_hash, verified_at`,
      [hashSession(raw), config.idleSeconds, request.routeOptions.url === '/api/auth/session']
    );
    if (!result.rowCount) throw fail(401, '会话已失效，请重新登录');
    request.session = { ...result.rows[0], csrf: csrf(raw) };
    if (
      !['GET', 'HEAD'].includes(request.method) &&
      !safeEqual(request.headers['x-csrf-token'] || '', request.session.csrf)
    )
      throw fail(403, '请求校验失败，请刷新页面');
  });
  app.decorate('fresh', async (request) => {
    if (Date.now() - new Date(request.session.verified_at).getTime() > config.reauthSeconds * 1000)
      throw fail(428, '请重新验证主密码');
  });
  const authenticated = { preHandler: [app.authenticate] };
  app.get('/api/auth/state', async () => ({
    initialized: Boolean(
      (await pool.query("SELECT 1 FROM app_config WHERE key='master_password_hash'")).rowCount
    )
  }));
  app.get('/api/auth/session', authenticated, async (request) => ({
    ok: true,
    csrf: request.session.csrf
  }));
  app.post(
    '/api/auth/bootstrap',
    {
      bodyLimit: 2048,
      schema: { body: object({ password: newPassword, bootstrapToken: text(128, 1) }) }
    },
    async (request, reply) => {
      await limit(request);
      if (!config.bootstrapToken || !safeEqual(config.bootstrapToken, request.body.bootstrapToken))
        throw fail(403, '初始化凭据无效');
      return transaction(
        pool,
        async (client) => {
          if (
            (await client.query("SELECT 1 FROM app_config WHERE key='master_password_hash'"))
              .rowCount
          )
            throw fail(409, 'Vault 已完成初始化');
          const hash = await hashPassword(request.body.password);
          const inserted = await client.query(
            "INSERT INTO app_config(key,value) VALUES ('master_password_hash',$1) ON CONFLICT DO NOTHING RETURNING key",
            [hash]
          );
          if (!inserted.rowCount) throw fail(409, 'Vault 已完成初始化');
          return issue(client, reply);
        },
        72002001
      );
    }
  );
  app.post(
    '/api/auth/login',
    { bodyLimit: 2048, schema: { body: object({ password }) } },
    async (request, reply) => {
      await limit(request);
      return transaction(
        pool,
        async (client) => {
          const result = await client.query(
            "SELECT value FROM app_config WHERE key='master_password_hash'"
          );
          const valid = await verify(result.rows[0]?.value, request.body.password);
          if (!valid || !result.rowCount) throw fail(401, '主密码错误或尚未初始化');
          return issue(client, reply);
        },
        72002001
      );
    }
  );
  app.post(
    '/api/auth/reauth',
    { ...authenticated, bodyLimit: 2048, schema: { body: object({ password }) } },
    async (request) => {
      await limit(request);
      return transaction(
        pool,
        async (client) => {
          const r = await client.query(
            "SELECT value FROM app_config WHERE key='master_password_hash'"
          );
          if (!(await verify(r.rows[0]?.value, request.body.password)))
            throw fail(401, '主密码错误');
          const updated = await client.query(
            'UPDATE sessions SET verified_at=NOW() WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>NOW()',
            [request.session.token_hash]
          );
          if (!updated.rowCount) throw fail(401, '会话已失效');
          return { ok: true };
        },
        72002001
      );
    }
  );
  app.post('/api/auth/logout', authenticated, async (request, reply) => {
    await pool.query('UPDATE sessions SET revoked_at=NOW() WHERE token_hash=$1', [
      request.session.token_hash
    ]);
    reply.clearCookie(cookieName(config), {
      path: '/',
      secure: config.secureCookie,
      httpOnly: true,
      sameSite: 'strict'
    });
    return { ok: true };
  });
  app.post(
    '/api/auth/logout-all',
    { preHandler: [app.authenticate, app.fresh] },
    async (request, reply) => {
      await transaction(
        pool,
        (client) => client.query('UPDATE sessions SET revoked_at=NOW() WHERE revoked_at IS NULL'),
        72002001
      );
      reply.clearCookie(cookieName(config), { path: '/', secure: config.secureCookie });
      return { ok: true };
    }
  );
  app.post(
    '/api/auth/password',
    {
      preHandler: [app.authenticate],
      bodyLimit: 2048,
      schema: { body: object({ currentPassword: password, newPassword }) }
    },
    async (request, reply) => {
      await limit(request);
      await transaction(
        pool,
        async (client) => {
          const r = await client.query(
            "SELECT value FROM app_config WHERE key='master_password_hash'"
          );
          if (!(await verify(r.rows[0]?.value, request.body.currentPassword)))
            throw fail(401, '当前密码错误');
          await client.query(
            "UPDATE app_config SET value=$1,updated_at=NOW() WHERE key='master_password_hash'",
            [await hashPassword(request.body.newPassword)]
          );
          await client.query('UPDATE sessions SET revoked_at=NOW() WHERE revoked_at IS NULL');
        },
        72002001
      );
      reply.clearCookie(cookieName(config), { path: '/', secure: config.secureCookie });
      return { ok: true };
    }
  );
};
