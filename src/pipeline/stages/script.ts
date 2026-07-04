// Script stage: reads the research brief from the job, generates the 3-beat
// VideoScript via the Anthropic API, and returns it as JSON for the visuals
// and voice stages to consume.

import type { Job, ProductBrief, StageFn } from '../../types.js';
import { generateScript } from '../../lib/script.js';

export const script: StageFn = async (job: Job) => {
  const raw = job.stage_outputs.research;
  if (!raw) throw new Error('script stage: research brief missing');

  const brief = JSON.parse(raw) as ProductBrief;
  const result = await generateScript(brief, job.style, job.aspect_ratio);
  return JSON.stringify(result);
};
