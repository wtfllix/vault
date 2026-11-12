import { object, pagination } from '../schema.js';

// Successful detail/use requests only; metadata lists and search never count.
const accessRoutes = new Map([
  ['/api/files/:id', 'files'],
  ['/api/files/:id/download', 'files'],
  ['/api/files/:id/preview', 'files'],
  ['/api/notes/:id', 'notes'],
  ['/api/secrets/:id', 'secrets'],
  ['/api/secrets/:id/metadata', 'secrets']
]);

export const registerRecent = async (app, { pool }) => {
  app.addHook('onSend', async (request, reply, payload) => {
    const module = accessRoutes.get(request.routeOptions.url);
    if (module && request.method === 'GET' && reply.statusCode >= 200 && reply.statusCode < 300) {
      // Coalesce parallel detail/preview/copy requests and React StrictMode retries.
      // The conditional UPSERT serializes concurrent increments in PostgreSQL.
      await pool.query(
        `INSERT INTO resource_usage(module,resource_id) VALUES($1,$2)
         ON CONFLICT(module,resource_id) DO UPDATE
         SET use_count=resource_usage.use_count+1,last_opened_at=NOW()
         WHERE resource_usage.last_opened_at <= NOW()-INTERVAL '2 seconds'`,
        [module, String(request.params.id)]
      );
    }
    return payload;
  });
  app.get(
    '/api/recent',
    {
      preHandler: [app.authenticate],
      schema: {
        querystring: object(
          {
            module: { type: 'string', enum: ['files', 'notes', 'secrets'] },
            ...pagination
          },
          []
        )
      }
    },
    async (request) => {
      const { module, limit, offset } = request.query;
      const result = await pool.query(
        `WITH resources AS (
         SELECT id::text AS id,name AS title,'files' AS module,
                CASE WHEN is_folder THEN 'Folder' ELSE 'File' END AS type
         FROM files WHERE deleted_at IS NULL AND status='ready'
         UNION ALL
         SELECT id::text,title,'notes',language FROM notes WHERE deleted_at IS NULL
         UNION ALL
         SELECT id::text,name,'secrets',secret_type FROM secrets WHERE deleted_at IS NULL
       ), ranked AS (
         SELECT r.*,u.last_opened_at,u.use_count,
           ln(1+u.use_count::double precision) * power(2::double precision,
             -GREATEST(0,EXTRACT(EPOCH FROM (NOW()-u.last_opened_at))) / 604800.0) AS score
         FROM resource_usage u JOIN resources r ON r.module=u.module AND r.id=u.resource_id
         WHERE ($1::text IS NULL OR r.module=$1)
       )
       SELECT (SELECT count(*) FROM ranked) AS total,
         COALESCE(jsonb_agg(to_jsonb(page)-'score' ORDER BY score DESC,last_opened_at DESC,module,id), '[]'::jsonb) AS items
       FROM (SELECT * FROM ranked
         ORDER BY score DESC,last_opened_at DESC,module,id LIMIT $2 OFFSET $3) page`,
        [module || null, limit, offset]
      );
      return { items: result.rows[0].items, total: Number(result.rows[0].total) };
    }
  );
};
