// Mock stage implementations for Phase 1.
//
// Each stage sleeps 2 seconds and returns a placeholder string that gets
// written to the job's stage_outputs. In Phase 2 these are replaced one file
// at a time (research.ts, script.ts, visuals.ts, voice.ts, assemble.ts,
// deliver.ts) with the real Venice + ffmpeg implementations. The stage
// runner's contract stays identical, so the swap is isolated.

import type { Job, Stage, StageFn } from '../../types.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mockStage(stage: Stage, describe: (job: Job) => string): StageFn {
  return async (job: Job) => {
    await sleep(2000);
    return `[mock ${stage}] ${describe(job)}`;
  };
}

export const research: StageFn = mockStage(
  'research',
  (j) => `parsed ${j.input_type} input into a product brief`
);

export const script: StageFn = mockStage(
  'script',
  (j) => `3-beat script (hook / what-it-does / CTA) for ${j.input}`
);

export const visuals: StageFn = mockStage(
  'visuals',
  (j) => `3 ${j.style} clips at ${j.aspect_ratio}`
);

export const voice: StageFn = mockStage('voice', () => `TTS voiceover track`);

export const assemble: StageFn = mockStage(
  'assemble',
  () => `stitched clips + voiceover + burned subtitles`
);

export const deliver: StageFn = mockStage(
  'deliver',
  (j) => `uploaded final MP4 for job ${j.id}`
);
