// Serial worker loop. One process, one queue, one job at a time.
//
// Volume during the campaign is tens of jobs, not thousands — no Redis, no
// external workers. The loop polls the DB, runs the oldest unfinished job to
// completion, then polls again. On boot it naturally resumes any job left in
// 'processing' by a restart, because runJob() picks up after job.stage.

import { nextRunnableJob } from './db.js';
import { runJob } from './pipeline/index.js';

const POLL_INTERVAL_MS = 1000;

let running = false;
let stopped = false;

async function loop(): Promise<void> {
  if (running) return;
  running = true;
  try {
    // Drain everything runnable before yielding back to the poll timer.
    for (let job = nextRunnableJob(); job && !stopped; job = nextRunnableJob()) {
      console.log(`[worker] running job ${job.id} (from stage '${job.stage || 'start'}')`);
      await runJob(job);
      const done = job.id;
      console.log(`[worker] finished job ${done}`);
    }
  } catch (err) {
    console.error('[worker] loop error:', err);
  } finally {
    running = false;
  }
}

export function startWorker(): void {
  console.log('[worker] started');
  // Kick once immediately (resume in-flight work), then poll.
  void loop();
  const timer = setInterval(() => void loop(), POLL_INTERVAL_MS);
  timer.unref?.();
}

export function stopWorker(): void {
  stopped = true;
}
