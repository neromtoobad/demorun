// Entry point: start the HTTP server and the worker in one process.

// Must stay first: ESM evaluates imports top-to-bottom before the module body,
// so this loads .env before config.js / the script stage read process.env.
import './bootstrap.js';

import { serve } from '@hono/node-server';
import { app } from './server.js';
import { startWorker } from './worker.js';
import { config } from './config.js';

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`[server] listening on http://localhost:${info.port}`);
  console.log(`[server] payments enforced: ${config.paymentsEnforced}`);
});

startWorker();
