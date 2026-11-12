import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform, Writable } from 'node:stream';
import { fail } from './security.js';
const objectId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const createStorage = async (config) => {
  const root = config.storageRoot;
  await fs.mkdir(root, { recursive: true, mode: 0o2750 });
  if ((await fs.realpath(root)) !== path.resolve(root)) throw new Error('存储根目录禁止符号链接');
  for (const directory of ['objects', 'tmp']) {
    const dir = path.join(root, directory);
    await fs.mkdir(dir, { mode: directory === 'tmp' ? 0o700 : 0o2750, recursive: true });
    if (!(await fs.lstat(dir)).isDirectory() || (await fs.realpath(dir)) !== dir)
      throw new Error('存储目录无效');
    await fs.chmod(dir, directory === 'tmp' ? 0o700 : 0o2750);
  }
  const objectPath = (key) => {
    if (!objectId.test(key)) throw fail(400, '对象 ID 无效');
    return path.join(root, 'objects', key);
  };
  const check = async (key) => {
    const file = await fs.open(objectPath(key), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await file.stat();
      if (!stat.isFile()) throw fail(404, '文件不可用');
      return stat;
    } finally {
      await file.close();
    }
  };
  const write = async (stream, key, expectedHash) => {
    const destination = objectPath(key);
    const tmp = path.join(root, 'tmp', crypto.randomUUID());
    let handle;
    try {
      handle = await fs.open(
        tmp,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o640
      );
      let size = 0;
      const hash = crypto.createHash('sha256');
      const measure = new Transform({
        transform(chunk, encoding, callback) {
          size += chunk.length;
          if (size > config.maxFileSize) return callback(fail(413, '文件超过大小限制'));
          hash.update(chunk);
          callback(null, chunk);
        }
      });
      const sink = new Writable({
        write(chunk, encoding, callback) {
          handle.writeFile(chunk).then(() => callback(), callback);
        }
      });
      await pipeline(stream, measure, sink);
      if (stream.truncated) throw fail(413, '文件超过大小限制');
      const sha256 = hash.digest('hex');
      if (expectedHash && expectedHash !== sha256) throw fail(422, 'SHA-256 校验失败，请重试');
      await handle.sync();
      await handle.close();
      handle = null;
      await fs.rename(tmp, destination);
      const directory = await fs.open(path.join(root, 'objects'), constants.O_RDONLY);
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
      return { size, sha256 };
    } catch (error) {
      if (handle) await handle.close().catch(() => {});
      await fs.unlink(tmp).catch(() => {});
      throw error;
    }
  };
  return {
    root,
    objectPath,
    check,
    write,
    remove: (key) =>
      fs.unlink(objectPath(key)).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      }),
    space: async () => {
      const s = await fs.statfs(root);
      return {
        total: Number(s.blocks) * Number(s.bsize),
        available: Number(s.bavail) * Number(s.bsize)
      };
    }
  };
};
