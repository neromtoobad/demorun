// Research stage: reads the job's input, produces a normalized ProductBrief,
// and returns it as JSON for the script stage to consume.

import type { Job, StageFn } from '../../types.js';
import { research as runResearch } from '../../lib/research.js';

export const research: StageFn = async (job: Job) => {
  const brief = await runResearch(job.input, job.input_type);
  return JSON.stringify(brief);
};
