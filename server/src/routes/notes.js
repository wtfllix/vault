import crypto from 'node:crypto';
import { object, params, text, pagination, languages } from '../schema.js';
import { fail } from '../security.js';
const columns = 'id,title,language,version,favorite,created_at,updated_at,deleted_at';
const body = {
  title: text(255, 1),
  language: { type: 'string', enum: languages },
  content: text(1000000)
};
export const registerNotes = async (app, { pool, encryption }) => {
  const auth = [app.authenticate];
  app.get(
    '/api/notes',
    {
      preHandler: auth,
      schema: {
        querystring: object(
          {
            query: text(200),
            favorite: { type: 'boolean' },
            trash: { type: 'boolean' },
            ...pagination
          },
          []
        )
      }
    },
    async (request) => {
      const b = request.query;
      const r = await pool.query(
        `SELECT ${columns},count(*) OVER() AS total FROM notes WHERE ($1::boolean=(deleted_at IS NOT NULL))
      AND ($2='' OR title ILIKE '%'||$2||'%') AND (NOT $3 OR favorite) ORDER BY updated_at DESC,id LIMIT $4 OFFSET $5`,
        [b.trash || false, b.query || '', b.favorite || false, b.limit, b.offset]
      );
      return {
        items: r.rows.map(({ total, ...row }) => row),
        total: Number(r.rows[0]?.total || 0)
      };
    }
  );
  app.post('/api/notes', { preHandler: auth, schema: { body: object(body) } }, async (request) => {
    const b = request.body;
    const r = await pool.query(
      `INSERT INTO notes(id,title,language,encrypted_data) VALUES($1,$2,$3,$4) RETURNING ${columns}`,
      [crypto.randomUUID(), b.title, b.language, encryption.encrypt({ content: b.content })]
    );
    return { ...r.rows[0], content: b.content };
  });
  app.get('/api/notes/:id', { preHandler: auth, schema: params() }, async (request) => {
    const r = await pool.query(
      `SELECT ${columns},encrypted_data FROM notes WHERE id=$1 AND deleted_at IS NULL`,
      [request.params.id]
    );
    if (!r.rowCount) throw fail(404, '笔记不存在');
    const { encrypted_data, ...row } = r.rows[0];
    return { ...row, content: encryption.decrypt(encrypted_data).content };
  });
  app.put(
    '/api/notes/:id',
    {
      preHandler: auth,
      schema: { ...params(), body: object({ ...body, version: { type: 'integer', minimum: 1 } }) }
    },
    async (request) => {
      const b = request.body;
      const r = await pool.query(
        `UPDATE notes SET title=$1,language=$2,encrypted_data=$3,version=version+1,updated_at=NOW()
      WHERE id=$4 AND version=$5 AND deleted_at IS NULL RETURNING ${columns}`,
        [
          b.title,
          b.language,
          encryption.encrypt({ content: b.content }),
          request.params.id,
          b.version
        ]
      );
      if (!r.rowCount) throw fail(409, '笔记已在其他页面修改。当前草稿已保留，请另存或重新加载');
      return r.rows[0];
    }
  );
  app.patch(
    '/api/notes/:id/favorite',
    { preHandler: auth, schema: { ...params(), body: object({ favorite: { type: 'boolean' } }) } },
    async (request) => {
      const r = await pool.query(
        `UPDATE notes SET favorite=$1,updated_at=NOW() WHERE id=$2 AND deleted_at IS NULL RETURNING ${columns}`,
        [request.body.favorite, request.params.id]
      );
      if (!r.rowCount) throw fail(404, '笔记不存在');
      return r.rows[0];
    }
  );
  app.delete('/api/notes/:id', { preHandler: auth, schema: params() }, async (request) => {
    const r = await pool.query(
      'UPDATE notes SET deleted_at=NOW(),version=version+1,updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL',
      [request.params.id]
    );
    if (!r.rowCount) throw fail(404, '笔记不存在');
    return { ok: true };
  });
  app.post('/api/notes/:id/restore', { preHandler: auth, schema: params() }, async (request) => {
    const r = await pool.query(
      'UPDATE notes SET deleted_at=NULL,version=version+1,updated_at=NOW() WHERE id=$1 AND deleted_at IS NOT NULL',
      [request.params.id]
    );
    if (!r.rowCount) throw fail(404, '笔记不存在');
    return { ok: true };
  });
  app.put(
    '/api/notes/:id/draft',
    {
      preHandler: auth,
      schema: { ...params(), body: object({ ...body, version: { type: 'integer', minimum: 1 } }) }
    },
    async (request) => {
      const exists = await pool.query('SELECT 1 FROM notes WHERE id=$1 AND deleted_at IS NULL', [
        request.params.id
      ]);
      if (!exists.rowCount) throw fail(404, '笔记不存在');
      await pool.query(
        `INSERT INTO note_drafts(session_hash,note_id,encrypted_data) VALUES($1,$2,$3)
      ON CONFLICT(session_hash,note_id) DO UPDATE SET encrypted_data=EXCLUDED.encrypted_data,updated_at=NOW()`,
        [request.session.token_hash, request.params.id, encryption.encrypt(request.body)]
      );
      return { ok: true };
    }
  );
  app.get('/api/notes/:id/draft', { preHandler: auth, schema: params() }, async (request) => {
    const r = await pool.query(
      'SELECT encrypted_data FROM note_drafts WHERE session_hash=$1 AND note_id=$2',
      [request.session.token_hash, request.params.id]
    );
    return r.rowCount ? encryption.decrypt(r.rows[0].encrypted_data) : null;
  });
  app.delete('/api/notes/:id/draft', { preHandler: auth, schema: params() }, async (request) => {
    await pool.query('DELETE FROM note_drafts WHERE session_hash=$1 AND note_id=$2', [
      request.session.token_hash,
      request.params.id
    ]);
    return { ok: true };
  });
};
