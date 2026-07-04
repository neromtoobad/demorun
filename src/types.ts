// Shared types for the DEMORUN service.

export const STAGES = [
  'research',
  'script',
  'visuals',
  'voice',
  'assemble',
  'deliver',
] as const;

export type Stage = (typeof STAGES)[number];

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export const ASPECT_RATIOS = ['9:16', '16:9'] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export const STYLES = ['clean-tech', 'ugc', 'cinematic'] as const;
export type Style = (typeof STYLES)[number];

export type InputType = 'url' | 'text';

// Normalized product brief produced by the research stage and consumed by
// the script stage. Persisted as JSON in stage_outputs.research.
export interface ProductBrief {
  name: string;
  one_liner: string;
  audience: string;
  features: string[];
  tone: string;
  // Provenance so later stages / debugging know how the brief was derived.
  source: { type: 'okx' | 'github' | 'web' | 'text'; url?: string };
}

// One row in the jobs table. stage_outputs is stored as JSON text in SQLite
// and parsed to this shape when read.
export interface Job {
  id: string;
  input: string;
  input_type: InputType;
  style: Style;
  aspect_ratio: AspectRatio;
  status: JobStatus;
  // Name of the last stage that completed, or '' before any stage has run.
  stage: Stage | '';
  stage_outputs: Partial<Record<Stage, string>>;
  result_url: string | null;
  error: string | null;
  paid_tx: string | null;
  created_at: string;
  updated_at: string;
}

// A pipeline stage: takes the current job, does its work, returns a string
// (often JSON) that gets written to stage_outputs[stageName].
export type StageFn = (job: Job) => Promise<string>;
