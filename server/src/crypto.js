import crypto from 'node:crypto';
import { config } from './config.js';

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;

export const encryptJson = (value) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, config.masterKey, iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return JSON.stringify({
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ct: encrypted.toString('base64')
  });
};

export const decryptJson = (encryptedText) => {
  const payload = JSON.parse(encryptedText);
  const iv = Buffer.from(payload.iv, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const ciphertext = Buffer.from(payload.ct, 'base64');

  const decipher = crypto.createDecipheriv(ALGO, config.masterKey, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
};
