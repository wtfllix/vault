import crypto from 'node:crypto';
export const hashSession = (value) => crypto.createHash('sha256').update(value).digest('hex');
export const safeEqual = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};
export const validName = (name) =>
  typeof name === 'string' &&
  name.length > 0 &&
  name.length <= 255 &&
  name === name.trim() &&
  !/[\x00-\x1f\x7f/\\]/.test(name) &&
  !['.', '..'].includes(name);
export const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
export class Semaphore {
  constructor(limit = 2, maxQueue = 8) {
    this.limit = limit;
    this.maxQueue = maxQueue;
    this.active = 0;
    this.queue = [];
  }
  async run(fn) {
    if (this.active >= this.limit) {
      if (this.queue.length >= this.maxQueue) throw fail(429, '认证繁忙，请稍后重试');
      await new Promise((resolve) => this.queue.push(resolve));
    } else this.active++;
    try {
      return await fn();
    } finally {
      const next = this.queue.shift();
      if (next) next();
      else this.active--;
    }
  }
}
export const cookieName = (config) =>
  config.secureCookie ? '__Host-vault_session' : 'vault_dev_session';
export const sessionCookie = (config) => ({
  httpOnly: true,
  secure: config.secureCookie,
  sameSite: 'strict',
  path: '/',
  maxAge: config.sessionSeconds
});
