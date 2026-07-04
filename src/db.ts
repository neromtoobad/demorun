// SQLite job store. One process, one DB, synchronous access via better-sqlite3.

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import type {
  AspectRatio,
  InputType,
  Job,
  JobStatus,
  Stage,
  Style,
} from './types.js';

// Ensure the directory for the DB file exists (e.g. ./data on first boot,
// or the Railway volume mount path in production).
mkdirSync(dirname(config.databasePath), { recursive: true });

const db = new Database(config.databasePath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id            TEXT PRIMARY KEY,
    input         TEXT NOT NULL,
    input_type    TEXT NOT NULL,
    style         TEXT NOT NULL,
    aspect_ratio  TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'queued',
    stage         TEXT NOT NULL DEFAULT '',
    stage_outputs TEXT NOT NULL DEFAULT '{}',
    result_url    TEXT,
    error         TEXT,
    paid_tx       TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  );
`);

// A row as stored in SQLite (stage_outputs is raw JSON text).
interface JobRow {
  id: string;
  input: string;
  input_type: InputType;
  style: Style;
  aspect_ratio: AspectRatio;
  status: JobStatus;
  stage: Stage | '';
  stage_outputs: string;
  result_url: string | null;
  error: string | null;
  paid_tx: string | null;
  created_at: string;
  updated_at: string;
}

function hydrate(row: JobRow | undefined): Job | undefined {
  if (!row) return undefined;
  return {
    ...row,
    stage_outputs: JSON.parse(row.stage_outputs) as Job['stage_outputs'],
  };
}

const now = () => new Date().toISOString();

export interface CreateJobInput {
  input: string;
  input_type: InputType;
  style: Style;
  aspect_ratio: AspectRatio;
  paid_tx?: string | null;
}

export function createJob(input: CreateJobInput): Job {
  const id = randomUUID();
  const ts = now();
  db.prepare(
    `INSERT INTO jobs (id, input, input_type, style, aspect_ratio, status, stage, stage_outputs, paid_tx, created_at, updated_at)
     VALUES (@id, @input, @input_type, @style, @aspect_ratio, 'queued', '', '{}', @paid_tx, @created_at, @updated_at)`
  ).run({
    id,
    input: input.input,
    input_type: input.input_type,
    style: input.style,
    aspect_ratio: input.aspect_ratio,
    paid_tx: input.paid_tx ?? null,
    created_at: ts,
    updated_at: ts,
  });
  return getJob(id)!;
}

export function getJob(id: string): Job | undefined {
  const row = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(id) as
    | JobRow
    | undefined;
  return hydrate(row);
}

// The next job the worker should run: anything not yet finished, oldest first.
// Includes 'processing' so a job interrupted by a restart is picked back up.
export function nextRunnableJob(): Job | undefined {
  const row = db
    .prepare(
      `SELECT * FROM jobs
       WHERE status IN ('queued', 'processing')
       ORDER BY created_at ASC
       LIMIT 1`
    )
    .get() as JobRow | undefined;
  return hydrate(row);
}

export function markProcessing(id: string): void {
  db.prepare(
    `UPDATE jobs SET status = 'processing', updated_at = ? WHERE id = ?`
  ).run(now(), id);
}

// Record a completed stage output and advance the job's stage pointer.
// Written per-stage so a crashed job resumes from the last completed stage.
export function recordStageOutput(id: string, stage: Stage, output: string): void {
  const job = getJob(id);
  if (!job) return;
  const outputs = { ...job.stage_outputs, [stage]: output };
  db.prepare(
    `UPDATE jobs SET stage = ?, stage_outputs = ?, updated_at = ? WHERE id = ?`
  ).run(stage, JSON.stringify(outputs), now(), id);
}

export function markCompleted(id: string, resultUrl: string): void {
  db.prepare(
    `UPDATE jobs SET status = 'completed', result_url = ?, error = NULL, updated_at = ? WHERE id = ?`
  ).run(resultUrl, now(), id);
}

export function markFailed(id: string, error: string): void {
  db.prepare(
    `UPDATE jobs SET status = 'failed', error = ?, updated_at = ? WHERE id = ?`
  ).run(error, now(), id);
}
