// Minimal .env loader. The service reads process.env directly; this fills it
// from a .env file when present, without pulling in a dependency. Real
// environment variables always win (only unset keys are filled).

import { existsSync, readFileSync } from 'node:fs';

export function loadEnv(path = '.env'): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2].replace(/^["']|["']$/g, '');
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
