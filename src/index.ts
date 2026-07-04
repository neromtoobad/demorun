// Entry point: start the HTTP server and the worker in one process.

import { serve } from '@hono/node-server';
import { app } from './server.js';
import { startWorker } from './worker.js';
import { config } from './config.js';

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`[server] listening on http://localhost:${info.port}`);
  console.log(`[server] payments enforced: ${config.paymentsEnforced}`);
});

startWorker();
