// Explicit pool ownership and transactional migrations live in database.js.
export { makePool, transaction, migrate } from './database.js';
