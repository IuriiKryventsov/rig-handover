import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestNight, DigestRow, LogLine, ReadNight, RunStatus, StatusCounts } from './types.js';

// Plan morning-digest § 1 (#2). The rules (bad lines, owner, error, times, order) are the
// comments in ./types.ts; this file follows them.

// `night` comes from a URL and goes into a file path: this shape only, checked before the disk.
const NIGHT = /^\d{4}-\d{2}-\d{2}$/;

function isRunStatus(v: unknown): v is RunStatus {
  return v === 'ok' || v === 'retry' || v === 'fail';
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v !== '';
}

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'ENOENT';
}

// One non-blank line of the log, or null if it is a bad line.
function parseLine(text: string): LogLine | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { at, job, status, owner, error } = value as Record<string, unknown>;
  if (!isNonEmptyString(at) || !isNonEmptyString(job) || !isRunStatus(status)) return null;
  const line: LogLine = { at, job, status, owner: typeof owner === 'string' ? owner : null };
  if (typeof error === 'string') line.error = error;
  return line;
}

export function readNight(runsDir: string, night: string): DigestNight | null {
  if (!NIGHT.test(night)) return null;

  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }

  const byJob = new Map<string, DigestRow>();
  const counts: StatusCounts = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;

  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (line === null) {
      badLines += 1;
      continue;
    }
    counts[line.status] += 1;

    // Lines arrive in file order, so "last" and "latest" are simply the most recent one seen.
    let row = byJob.get(line.job);
    if (row === undefined) {
      row = {
        job: line.job,
        owner: null,
        runs: 0,
        retries: 0,
        lastStatus: line.status,
        lastError: null,
        firstAt: line.at,
        lastAt: line.at,
      };
      byJob.set(line.job, row);
    }
    row.runs += 1;
    if (line.status === 'retry') row.retries += 1;
    row.lastStatus = line.status;
    row.lastAt = line.at;
    if (line.owner !== null) row.owner = line.owner;
    if (line.error !== undefined) row.lastError = line.error;
  }

  // Plain string order (UTF-16 code units), not localeCompare.
  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));

  return { night, rows, badLines, counts };
}

readNight satisfies ReadNight;
