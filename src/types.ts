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
