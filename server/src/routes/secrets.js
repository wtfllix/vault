import { object, params, secretId, secretBody, text, pagination } from '../schema.js';
import { fail } from '../security.js';
const columns =
  'id,secret_type,name,tags,environment,favorite,version,created_at,updated_at,deleted_at';
export const registerSecrets = async (app, { pool, encryption }) => {
  const auth = [app.authenticate];
  app.get(
    '/api/secrets',
    {
      preHandler: auth,
      schema: {
        querystring: object(
          {
            query: text(200),
            type: text(30),
            tag: text(40),
            favorite: { type: 'boolean' },
            trash: { type: 'boolean' },
            ...pagination
          },
          []
        )
      }
    },
    async (request) => {
      const {
        query = '',
        type = '',
        tag = '',
        favorite = false,
        trash = false,
        limit,
        offset
      } = request.query;
      const r = await pool.query(
        `SELECT ${columns},count(*) OVER() AS total FROM secrets WHERE
      ($1::boolean = (deleted_at IS NOT NULL)) AND ($2='' OR name ILIKE '%'||$2||'%')
      AND ($3='' OR secret_type=$3) AND ($4='' OR $4=ANY(tags)) AND (NOT $5 OR favorite)
      ORDER BY updated_at DESC,id DESC LIMIT $6 OFFSET $7`,
        [trash, query, type, tag, favorite, limit, offset]
      );
      return {
        items: r.rows.map(({ total, ...row }) => row),
        total: Number(r.rows[0]?.total || 0)
      };
    }
  );
  app.get(
    '/api/secrets/:id/metadata',
    { preHandler: auth, schema: params(secretId) },
    async (request) => {
      const r = await pool.query(
        `SELECT ${columns} FROM secrets WHERE id=$1 AND deleted_at IS NULL`,
        [request.params.id]
      );
      if (!r.rowCount) throw fail(404, '记录不存在');
      return r.rows[0];
    }
  );
  app.post('/api/secrets', { preHandler: auth, schema: { body: secretBody } }, async (request) => {
    const b = request.body;
    const encrypted = encryption.encrypt({ vaultEnvelope: 2, data: b.data, note: b.note || '' });
    const r = await pool.query(
      `INSERT INTO secrets(secret_type,name,encrypted_data,tags,environment,favorite)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING ${columns}`,
      [b.secret_type, b.name, encrypted, b.tags || [], b.environment || '', b.favorite || false]
    );
    return r.rows[0];
  });
  app.get('/api/secrets/:id', { preHandler: auth, schema: params(secretId) }, async (request) => {
    const r = await pool.query(
      `SELECT ${columns},encrypted_data FROM secrets WHERE id=$1 AND deleted_at IS NULL`,
      [request.params.id]
    );
    if (!r.rowCount) throw fail(404, '记录不存在');
    const { encrypted_data, ...row } = r.rows[0];
    const payload = encryption.decrypt(encrypted_data);
    return {
      ...row,
      ...(JSON.parse(encrypted_data).v === 2 && payload?.vaultEnvelope === 2
        ? { data: payload.data, note: payload.note }
        : { data: payload, note: '' })
    };
  });
  app.put(
    '/api/secrets/:id',
    {
      preHandler: auth,
      schema: {
        ...params(secretId),
        body: { ...secretBody, required: [...secretBody.required, 'version'] }
      }
    },
    async (request) => {
      const b = request.body;
      const r = await pool.query(
        `UPDATE secrets SET secret_type=$1,name=$2,encrypted_data=$3,tags=$4,environment=$5,
      favorite=$6,version=version+1,updated_at=NOW() WHERE id=$7 AND version=$8 AND deleted_at IS NULL RETURNING ${columns}`,
        [
          b.secret_type,
          b.name,
          encryption.encrypt({ vaultEnvelope: 2, data: b.data, note: b.note || '' }),
          b.tags || [],
          b.environment || '',
          b.favorite || false,
          request.params.id,
          b.version
        ]
      );
      if (!r.rowCount) throw fail(409, '记录已被修改，请重新打开后编辑');
      return r.rows[0];
    }
  );
  app.patch(
    '/api/secrets/:id/favorite',
    {
      preHandler: auth,
      schema: { ...params(secretId), body: object({ favorite: { type: 'boolean' } }) }
    },
    async (request) => {
      const r = await pool.query(
        `UPDATE secrets SET favorite=$1,version=version+1,updated_at=NOW() WHERE id=$2 AND deleted_at IS NULL RETURNING ${columns}`,
        [request.body.favorite, request.params.id]
      );
      if (!r.rowCount) throw fail(404, '记录不存在');
      return r.rows[0];
    }
  );
  app.delete(
    '/api/secrets/:id',
    { preHandler: auth, schema: params(secretId) },
    async (request) => {
      const r = await pool.query(
        'UPDATE secrets SET deleted_at=NOW(),version=version+1,updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL',
        [request.params.id]
      );
      if (!r.rowCount) throw fail(404, '记录不存在');
      return { ok: true };
    }
  );
  app.post(
    '/api/secrets/:id/restore',
    { preHandler: auth, schema: params(secretId) },
    async (request) => {
      const r = await pool.query(
        'UPDATE secrets SET deleted_at=NULL,version=version+1,updated_at=NOW() WHERE id=$1 AND deleted_at IS NOT NULL',
        [request.params.id]
      );
      if (!r.rowCount) throw fail(404, '记录不存在');
      return { ok: true };
    }
  );
};
