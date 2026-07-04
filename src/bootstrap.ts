// Side-effect module: load .env into process.env. Imported first by index.ts
// so it runs before any other module (config, the Anthropic client) reads env.
import { loadEnv } from './lib/loadEnv.js';

loadEnv();
