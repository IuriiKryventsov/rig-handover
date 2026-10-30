// Plan morning-digest § 1. The contract the reader (#2) and every part of § 2 code against.
// Types only. Import with `from './digest/types.js'` (path relative to the importing file).

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, once parsed. A non-blank line is bad (counted, never thrown)
// if it isn't a JSON object, or its `at` or `job` isn't a non-empty string, or its `status`
// isn't a RunStatus. An `owner` that isn't a string reads as null; a non-string `error` as
// none. Blank lines (e.g. the trailing newline) are skipped, not bad.
export type LogLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job. A job's lines are taken in file order (the log is append-only).
export type DigestRow = {
  job: string;
  owner: string | null; // latest string owner among its lines; null if none (shown as '—')
  runs: number; // all of its lines, retries included
  retries: number; // its lines with status 'retry'
  lastStatus: RunStatus; // status of its last line
  lastError: string | null; // latest `error` among its lines; null if none had one
  firstAt: string; // `at` of its first line, exactly as written: offset kept, never UTC
  lastAt: string; // `at` of its last line, exactly as written
};

// Parsed log lines by status, all jobs together; bad lines are not in here. So
// ok + retry + fail = sum of rows' runs, and retry = sum of rows' retries.
export type StatusCounts = { ok: number; retry: number; fail: number };

// A night that has a file. Plain JSON data (null, never undefined; no Date): the JSON route can
// send it as is. An empty night (file there, no line parsed) has rows [] and all counts 0:
// the page says "nothing ran". It is never null.
// e.g. 2026-10-28: 5 rows, badLines 1, counts { ok: 10, retry: 4, fail: 1 }.
export type DigestNight = {
  night: string; // YYYY-MM-DD, the file name without .jsonl
  rows: DigestRow[]; // sorted by job, ascending, plain string order (not localeCompare)
  badLines: number; // non-blank lines that didn't parse into a LogLine
  counts: StatusCounts;
};

// Implemented as `export function readNight` in src/digest/read.ts (#2); synchronous, like the
// rest of src/. Returns null for "no night" (→ 404 on page and JSON): `night` isn't YYYY-MM-DD
// (checked before touching the disk) or <runsDir>/<night>.jsonl doesn't exist. Other read
// errors throw.
export type ReadNight = (runsDir: string, night: string) => DigestNight | null;
