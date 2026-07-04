// HTTP routes. Async job pattern: POST creates a job and returns immediately;
// the worker runs the pipeline; GET polls status.

import { Hono } from 'hono';
import {
  ASPECT_RATIOS,
  STYLES,
  type AspectRatio,
  type InputType,
  type Style,
} from './types.js';
import { createJob, getJob } from './db.js';
import { ETA_SECONDS } from './pipeline/index.js';
import { paymentGate } from './middleware/payment.js';

type Vars = { paidTx?: string };
export const app = new Hono<{ Variables: Vars }>();

app.get('/v1/health', (c) => c.json({ status: 'ok' }));

interface JobBody {
  input_url?: unknown;
  input_text?: unknown;
  aspect_ratio?: unknown;
  style?: unknown;
}

// Returns a normalized input or an error message describing the first problem.
function validate(body: JobBody):
  | { ok: true; input: string; input_type: InputType; style: Style; aspect_ratio: AspectRatio }
  | { ok: false; error: string } {
  const hasUrl = typeof body.input_url === 'string' && body.input_url.trim() !== '';
  const hasText = typeof body.input_text === 'string' && body.input_text.trim() !== '';

  if (hasUrl === hasText) {
    return { ok: false, error: 'provide exactly one of input_url or input_text' };
  }
  if (!ASPECT_RATIOS.includes(body.aspect_ratio as AspectRatio)) {
    return { ok: false, error: `aspect_ratio must be one of ${ASPECT_RATIOS.join(', ')}` };
  }
  if (!STYLES.includes(body.style as Style)) {
    return { ok: false, error: `style must be one of ${STYLES.join(', ')}` };
  }

  return {
    ok: true,
    input: (hasUrl ? (body.input_url as string) : (body.input_text as string)).trim(),
    input_type: hasUrl ? 'url' : 'text',
    style: body.style as Style,
    aspect_ratio: body.aspect_ratio as AspectRatio,
  };
}

app.post('/v1/jobs', paymentGate, async (c) => {
  let body: JobBody;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }

  const v = validate(body);
  if (!v.ok) {
    return c.json({ error: v.error }, 400);
  }

  const job = createJob({
    input: v.input,
    input_type: v.input_type,
    style: v.style,
    aspect_ratio: v.aspect_ratio,
    paid_tx: c.get('paidTx') ?? null,
  });

  return c.json({ job_id: job.id, eta_seconds: ETA_SECONDS }, 201);
});

app.get('/v1/jobs/:id', (c) => {
  const job = getJob(c.req.param('id'));
  if (!job) {
    return c.json({ error: 'job not found' }, 404);
  }
  return c.json({
    status: job.status,
    result_url: job.result_url ?? undefined,
    script: job.stage_outputs.script ?? undefined,
    error: job.error ?? undefined,
  });
});
