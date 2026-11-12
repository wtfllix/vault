import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { transaction } from '../database.js';
import { object, params, uuid, text, pagination } from '../schema.js';
import { fail, validName, Semaphore } from '../security.js';
const parent = { anyOf: [uuid, { type: 'null' }] };
const cols =
  'id,parent_id,name,mime_type,size,sha256,is_folder,status,favorite,created_at,updated_at,deleted_at';
export const registerFiles = async (app, { pool, storage, config }) => {
  const auth = [app.authenticate];
  const uploads = new Semaphore(2, 2);
  const folderLock = 72002002;
  const assertName = (name) => {
    if (!validName(name)) throw fail(400, '名称不能包含路径、控制字符或首尾空格');
  };
  const assertFolder = async (client, id) => {
    if (
      id &&
      !(
        await client.query(
          "SELECT 1 FROM files WHERE id=$1 AND is_folder AND deleted_at IS NULL AND status='ready'",
          [id]
        )
      ).rowCount
    )
      throw fail(400, '目标文件夹不存在');
  };
  app.get('/api/storage', { preHandler: auth }, async () => {
    const usage = await pool.query('SELECT COALESCE(sum(size),0) AS used FROM files');
    return {
      ...(await storage.space()),
      used: Number(usage.rows[0].used),
      quota: config.storageQuota,
      maxFileSize: config.maxFileSize
    };
  });
  app.get(
    '/api/files',
    {
      preHandler: auth,
      schema: {
        querystring: object(
          {
            parent_id: uuid,
            query: text(200),
            sort: { type: 'string', enum: ['name', 'updated_at', 'size'], default: 'updated_at' },
            order: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
            favorite: { type: 'boolean' },
            trash: { type: 'boolean' },
            folders: { type: 'boolean' },
            ...pagination
          },
          []
        )
      }
    },
    async (request) => {
      const b = request.query;
      const r = await pool.query(
        `SELECT ${cols},count(*) OVER() AS total FROM files WHERE status='ready'
      AND ($1::boolean = (deleted_at IS NOT NULL)) AND ($2='' OR name ILIKE '%'||$2||'%')
      AND ($3::boolean OR $1 OR $4<>'' OR $5::boolean OR parent_id IS NOT DISTINCT FROM $6::uuid)
      AND (NOT $3 OR favorite) AND (NOT $5 OR is_folder)
      ORDER BY is_folder DESC,${b.sort} ${b.order},id LIMIT $7 OFFSET $8`,
        [
          b.trash || false,
          b.query || '',
          b.favorite || false,
          b.query || '',
          b.folders || false,
          b.parent_id || null,
          b.limit,
          b.offset
        ]
      );
      return {
        items: r.rows.map(({ total, ...row }) => row),
        total: Number(r.rows[0]?.total || 0)
      };
    }
  );
  app.get('/api/files/:id', { preHandler: auth, schema: params() }, async (request) => {
    const r = await pool.query(
      `SELECT ${cols} FROM files WHERE id=$1 AND deleted_at IS NULL AND status='ready'`,
      [request.params.id]
    );
    if (!r.rowCount) throw fail(404, '文件不存在');
    const ancestors = await pool.query(
      `WITH RECURSIVE chain AS (
      SELECT id,parent_id,name,0 AS depth FROM files WHERE id=$1
      UNION ALL SELECT f.id,f.parent_id,f.name,c.depth+1 FROM files f JOIN chain c ON f.id=c.parent_id WHERE c.depth<32
    ) SELECT id,name FROM chain ORDER BY depth DESC`,
      [request.params.id]
    );
    return { ...r.rows[0], path: ancestors.rows };
  });
  app.post(
    '/api/files/folders',
    { preHandler: auth, schema: { body: object({ name: text(255, 1), parent_id: parent }) } },
    async (request) => {
      assertName(request.body.name);
      return transaction(
        pool,
        async (client) => {
          await assertFolder(client, request.body.parent_id);
          const r = await client.query(
            `INSERT INTO files(id,parent_id,name,is_folder) VALUES($1,$2,$3,true) RETURNING ${cols}`,
            [crypto.randomUUID(), request.body.parent_id, request.body.name]
          );
          return r.rows[0];
        },
        folderLock
      );
    }
  );
  app.post(
    '/api/files/upload',
    {
      preHandler: auth,
      schema: {
        querystring: object(
          { parent_id: uuid, sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' } },
          []
        )
      }
    },
    async (request) =>
      uploads.run(async () => {
        const part = await request.file();
        if (!part) throw fail(400, '请选择文件');
        assertName(part.filename);
        const id = crypto.randomUUID();
        const key = crypto.randomUUID();
        const parentId = request.query.parent_id || null;
        try {
          await transaction(
            pool,
            async (client) => {
              await assertFolder(client, parentId);
              const usage = Number(
                (await client.query('SELECT COALESCE(sum(size),0) AS used FROM files')).rows[0].used
              );
              const reservations = Number(
                (
                  await client.query(
                    "SELECT COALESCE(sum(size),0) AS used FROM files WHERE status='uploading'"
                  )
                ).rows[0].used
              );
              const space = await storage.space();
              if (
                usage + config.maxFileSize > config.storageQuota ||
                space.available - reservations - config.maxFileSize < config.reserveBytes
              )
                throw fail(507, '存储空间不足，请清理文件或提高配额');
              await client.query(
                "INSERT INTO files(id,parent_id,name,storage_key,mime_type,size,status) VALUES($1,$2,$3,$4,$5,$6,'uploading')",
                [
                  id,
                  parentId,
                  part.filename,
                  key,
                  /^[\w.+-]+\/[\w.+-]+$/.test(part.mimetype)
                    ? part.mimetype
                    : 'application/octet-stream',
                  config.maxFileSize
                ]
              );
            },
            folderLock
          );
          const result = await storage.write(part.file, key, request.query.sha256);
          return await transaction(
            pool,
            async (client) => {
              await assertFolder(client, parentId);
              const r = await client.query(
                `UPDATE files SET size=$1,sha256=$2,status='ready',updated_at=NOW() WHERE id=$3 AND deleted_at IS NULL RETURNING ${cols},storage_key`,
                [result.size, result.sha256, id]
              );
              if (!r.rowCount) throw fail(409, '上传期间目标文件已被删除');
              return r.rows[0];
            },
            folderLock
          );
        } catch (error) {
          part.file.resume();
          await storage.remove(key);
          await pool.query("DELETE FROM files WHERE id=$1 AND status='uploading'", [id]);
          throw error;
        }
      })
  );
  app.patch(
    '/api/files/:id',
    {
      preHandler: auth,
      schema: {
        ...params(),
        body: object({ name: text(255, 1), parent_id: parent, favorite: { type: 'boolean' } }, [])
      }
    },
    async (request) => {
      const b = request.body;
      if (b.name !== undefined) assertName(b.name);
      return transaction(
        pool,
        async (client) => {
          if (b.parent_id !== undefined) await assertFolder(client, b.parent_id);
          const r = await client.query(
            `UPDATE files SET name=COALESCE($1,name),parent_id=CASE WHEN $2 THEN $3::uuid ELSE parent_id END,
        favorite=COALESCE($4,favorite),updated_at=NOW() WHERE id=$5 AND deleted_at IS NULL AND status='ready' RETURNING ${cols}`,
            [
              b.name ?? null,
              b.parent_id !== undefined,
              b.parent_id || null,
              b.favorite ?? null,
              request.params.id
            ]
          );
          if (!r.rowCount) throw fail(404, '文件不存在');
          return r.rows[0];
        },
        folderLock
      );
    }
  );
  app.delete('/api/files/:id', { preHandler: auth, schema: params() }, async (request) =>
    transaction(
      pool,
      async (client) => {
        const r = await client.query(
          `WITH RECURSIVE tree AS (
      SELECT id FROM files WHERE id=$1 AND deleted_at IS NULL
      UNION ALL SELECT f.id FROM files f JOIN tree t ON f.parent_id=t.id WHERE f.deleted_at IS NULL
    ) UPDATE files SET deleted_at=NOW(),updated_at=NOW() WHERE id IN (SELECT id FROM tree) RETURNING id`,
          [request.params.id]
        );
        if (!r.rowCount) throw fail(404, '文件不存在');
        return { ok: true };
      },
      folderLock
    )
  );
  app.post('/api/files/:id/restore', { preHandler: auth, schema: params() }, async (request) =>
    transaction(
      pool,
      async (client) => {
        const selected = (
          await client.query(
            'SELECT id,parent_id,deleted_at::text AS deletion_marker FROM files WHERE id=$1 AND deleted_at IS NOT NULL',
            [request.params.id]
          )
        ).rows[0];
        if (!selected) throw fail(404, '记录不存在');
        await assertFolder(client, selected.parent_id);
        // Restore parent before children, and only records from the same deletion operation.
        const tree = await client.query(
          `WITH RECURSIVE tree AS (
      SELECT id,deleted_at,0 AS depth FROM files WHERE id=$1
      UNION ALL SELECT f.id,f.deleted_at,t.depth+1 FROM files f JOIN tree t ON f.parent_id=t.id WHERE f.deleted_at=$2
    ) SELECT id FROM tree ORDER BY depth`,
          [selected.id, selected.deletion_marker]
        );
        for (const row of tree.rows)
          await client.query('UPDATE files SET deleted_at=NULL,updated_at=NOW() WHERE id=$1', [
            row.id
          ]);
        return { ok: true };
      },
      folderLock
    )
  );
  app.get(
    '/api/files/:id/download',
    { preHandler: auth, schema: params() },
    async (request, reply) => {
      const r = await pool.query(
        "SELECT storage_key,name,mime_type FROM files WHERE id=$1 AND NOT is_folder AND status='ready' AND deleted_at IS NULL",
        [request.params.id]
      );
      if (!r.rowCount) throw fail(404, '文件不存在');
      const f = r.rows[0];
      try {
        await storage.check(f.storage_key);
      } catch {
        throw fail(404, '文件对象不可用');
      }
      const encoded = encodeURIComponent(f.name).replace(
        /[!'()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
      );
      reply.header(
        'Content-Disposition',
        `attachment; filename="download"; filename*=UTF-8''${encoded}`
      );
      reply
        .type(f.mime_type)
        .header('X-Accel-Redirect', `/_private_objects/${f.storage_key}`)
        .send();
    }
  );
  app.get('/api/files/:id/preview', { preHandler: auth, schema: params() }, async (request) => {
    const r = await pool.query(
      "SELECT storage_key,name,size,mime_type FROM files WHERE id=$1 AND NOT is_folder AND status='ready' AND deleted_at IS NULL",
      [request.params.id]
    );
    if (!r.rowCount) throw fail(404, '文件不存在');
    const f = r.rows[0];
    if (Number(f.size) > 512 * 1024) throw fail(413, '预览仅支持 512 KB 以下文本或图片');
    await storage.check(f.storage_key);
    const bytes = await fs.readFile(storage.objectPath(f.storage_key));
    if (['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(f.mime_type))
      return { kind: 'image', mime: f.mime_type, content: bytes.toString('base64') };
    if (
      f.mime_type.startsWith('text/') ||
      /\.(json|ya?ml|env|toml|ini|conf|md|js|py|sh)$/i.test(f.name)
    )
      return { kind: 'text', content: bytes.toString('utf8') };
    throw fail(415, '此类型请下载后查看');
  });
};
