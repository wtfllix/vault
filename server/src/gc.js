import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from './settings.js';
import { makePool, transaction } from './database.js';
import { createStorage } from './storage.js';
const config = loadConfig();
const pool = makePool(config);
const storage = await createStorage(config);
try {
  await transaction(
    pool,
    async (client) => {
      const abandoned = await client.query(
        "DELETE FROM files WHERE status='uploading' AND created_at < NOW()-INTERVAL '24 hours' RETURNING storage_key"
      );
      for (const row of abandoned.rows) await storage.remove(row.storage_key);
      const known = new Set(
        (
          await client.query('SELECT storage_key FROM files WHERE storage_key IS NOT NULL')
        ).rows.map((r) => r.storage_key)
      );
      let removed = 0;
      for (const dir of ['objects', 'tmp']) {
        for (const entry of await fs.readdir(path.join(storage.root, dir), {
          withFileTypes: true
        })) {
          if (!entry.isFile() || (dir === 'objects' && known.has(entry.name))) continue;
          const file = path.join(storage.root, dir, entry.name);
          if ((await fs.lstat(file)).mtimeMs < Date.now() - 86400000) {
            await fs.unlink(file);
            removed++;
          }
        }
      }
      await client.query("DELETE FROM note_drafts WHERE updated_at < NOW()-INTERVAL '30 days'");
      await client.query("DELETE FROM sessions WHERE expires_at < NOW()-INTERVAL '30 days'");
      await client.query("DELETE FROM auth_limits WHERE reset_at<NOW()-INTERVAL '1 day'");
      console.log(`清理完成：${removed} 个过期孤儿对象；回收站数据保留。`);
    },
    72002002
  );
} finally {
  await pool.end();
}
