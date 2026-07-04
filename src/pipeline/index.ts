// Stage runner. Executes a job through the pipeline in order, resuming from
// the last completed stage. Each stage's output is persisted the moment it
// finishes, so a process restart continues from where it left off instead of
// re-running (and, in Phase 2, re-burning Venice credits for) earlier stages.

import { STAGES, type Job, type Stage } from '../types.js';
import { config } from '../config.js';
import {
  getJob,
  markCompleted,
  markFailed,
  markProcessing,
  recordStageOutput,
} from '../db.js';
import * as stages from './stages/mock.js';

const STAGE_FNS: Record<Stage, stages.StageFn> = {
  research: stages.research,
  script: stages.script,
  visuals: stages.visuals,
  voice: stages.voice,
  assemble: stages.assemble,
  deliver: stages.deliver,
};

// Estimated wall-clock time for a fresh job, surfaced to clients as eta_seconds.
export const ETA_SECONDS = STAGES.length * 2;

function resultUrlFor(jobId: string): string {
  return `${config.publicBaseUrl}/v1/assets/${jobId}.mp4`;
}

// Run one job to completion (or failure). Idempotent w.r.t. already-completed
// stages: it starts after job.stage and skips anything already done.
export async function runJob(job: Job): Promise<void> {
  markProcessing(job.id);

  const startIndex = job.stage ? STAGES.indexOf(job.stage) + 1 : 0;

  for (let i = startIndex; i < STAGES.length; i++) {
    const stage = STAGES[i];
    // Re-read so each stage sees outputs persisted by earlier stages.
    const current = getJob(job.id);
    if (!current) {
      markFailed(job.id, `job ${job.id} disappeared mid-run`);
      return;
    }

    try {
      const output = await STAGE_FNS[stage](current);
      recordStageOutput(job.id, stage, output);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      markFailed(job.id, `${stage}: ${reason}`);
      return;
    }
  }

  markCompleted(job.id, resultUrlFor(job.id));
}
