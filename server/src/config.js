// Compatibility entry point for local scripts. New code injects settings explicitly.
import { loadConfig } from './settings.js';
export const config = loadConfig();
