import crypto from 'node:crypto';
export const createEncryption = (config) => {
  const encrypt = (value) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', config.keys.get(config.keyId), iv);
    cipher.setAAD(Buffer.from(`vault:2:${config.keyId}`));
    const ct = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return JSON.stringify({
      v: 2,
      kid: config.keyId,
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ct: ct.toString('base64')
    });
  };
  const decrypt = (text) => {
    const p = JSON.parse(text);
    if (p.v !== undefined && p.v !== 2) throw new Error('不支持的密文版本');
    const iv = Buffer.from(p.iv, 'base64');
    const tag = Buffer.from(p.tag, 'base64');
    if (iv.length !== 12 || tag.length !== 16) throw new Error('密文格式无效');
    const keys = p.v === 2 ? [config.keys.get(p.kid)] : config.legacyKeys;
    for (const key of keys) {
      if (!key) continue;
      try {
        const cipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        if (p.v === 2) cipher.setAAD(Buffer.from(`vault:2:${p.kid}`));
        cipher.setAuthTag(tag);
        return JSON.parse(
          Buffer.concat([cipher.update(Buffer.from(p.ct, 'base64')), cipher.final()]).toString(
            'utf8'
          )
        );
      } catch {
        /* try explicitly configured legacy keys */
      }
    }
    throw new Error('密文验证失败');
  };
  return { encrypt, decrypt };
};
