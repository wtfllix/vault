import { config } from './config.js';
import { createEncryption } from './encryption.js';
const service = createEncryption(config);
export const encryptJson = service.encrypt;
export const decryptJson = service.decrypt;
