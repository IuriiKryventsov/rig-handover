import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';
import type { DigestNight } from '../src/digest/types.js';

// runs/ is read-only fixtures: anything else goes in a temp dir.
let tmp: string;
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'rig-digest-read-'));
});
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function runsDirWith(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmp, 'runs-'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

describe('readNight on runs/', () => {
  it('reads 2026-10-28: 5 jobs, 1 bad line, offsets kept', () => {
    const expected: DigestNight = {
      night: '2026-10-28',
      rows: [
        {
          job: 'digest/render',
          owner: null,
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-29T05:41:09+01:00',
          lastAt: '2026-10-29T05:41:09+01:00',
        },
        {
          job: 'fixtures/refresh',
          owner: 'rook',
          runs: 4,
          retries: 3,
          lastStatus: 'ok',
          lastError: 'upstream 503',
          firstAt: '2026-10-29T01:30:00+01:00',
          lastAt: '2026-10-29T01:37:00+01:00',
        },
        {
          job: 'lane/sync',
          owner: 'rook',
          runs: 8,
          retries: 1,
          lastStatus: 'ok',
          lastError: 'lock held',
          firstAt: '2026-10-28T23:00:06+01:00',
          lastAt: '2026-10-29T05:00:04+01:00',
        },
        {
          job: 'notes/backup',
          owner: 'lane-07',
          runs: 1,
          retries: 0,
          lastStatus: 'fail',
          lastError: 'quota exceeded',
          firstAt: '2026-10-29T04:00:01+01:00',
          lastAt: '2026-10-29T04:00:01+01:00',
        },
        {
          job: 'rig/rotate-logs',
          owner: 'lane-07',
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-28T23:00:02+01:00',
          lastAt: '2026-10-28T23:00:02+01:00',
        },
      ],
      badLines: 1,
      counts: { ok: 10, retry: 4, fail: 1 },
    };
    const night = readNight('runs', '2026-10-28');
    expect(night).toStrictEqual(expected);
    // Plain JSON data: survives a round trip unchanged (no undefined, no Date).
    expect(JSON.parse(JSON.stringify(night))).toStrictEqual(expected);
  });

  it('reads 2026-10-27: 4 jobs, all ok, no bad lines', () => {
    const night = readNight('runs', '2026-10-27');
    expect(night?.rows.map((r) => r.job)).toEqual([
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night?.badLines).toBe(0);
    expect(night?.counts).toEqual({ ok: 7, retry: 0, fail: 0 });
  });
});

describe('readNight: no night', () => {
  it('returns null when the file is missing', () => {
    expect(readNight(runsDirWith({}), '2026-10-28')).toBeNull();
  });

  it('returns null when the runs dir itself is missing', () => {
    expect(readNight(join(tmp, 'no-such-dir'), '2026-10-28')).toBeNull();
  });

  it.each([
    '../etc/passwd',
    '2026-10-28.jsonl',
    '2026-10-28/../2026-10-27',
    '',
    '2026-1-28',
    ' 2026-10-28',
    '2026-10-28\n',
    'abcd-ef-gh',
  ])('returns null for night %j, before reading any file', (bad) => {
    // A readable file sits exactly where each bad night would point, so null means "not read".
    const dir = mkdtempSync(join(tmp, 'bad-night-'));
    const runsDir = join(dir, 'runs');
    mkdirSync(join(dir, 'etc'), { recursive: true });
    mkdirSync(runsDir);
    const line = '{"at":"2026-10-28T23:00:00+01:00","job":"x","status":"ok","owner":null}\n';
    writeFileSync(join(dir, 'etc', 'passwd.jsonl'), line);
    writeFileSync(join(runsDir, '2026-10-28.jsonl.jsonl'), line);
    expect(readNight(runsDir, bad)).toBeNull();
  });
});

describe('readNight: content', () => {
  it('reads an empty file as a night with no rows', () => {
    const dir = runsDirWith({ '2026-10-01.jsonl': '', '2026-10-02.jsonl': '\n  \n\r\n' });
    const empty = { rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } };
    expect(readNight(dir, '2026-10-01')).toStrictEqual({ night: '2026-10-01', ...empty });
    expect(readNight(dir, '2026-10-02')).toStrictEqual({ night: '2026-10-02', ...empty });
  });

  it('counts bad lines instead of throwing, and keeps the good ones', () => {
    const lines = [
      '{"at":"2026-10-28T23:00:00-05:00","job":"a/job","status":"ok","owner":"amy"}',
      'not json',
      '{"at":"2026-10-28T23:00:01-05:00","job":"a/jo',
      '[1,2]',
      '"a string"',
      'null',
      '42',
      '{"job":"a/job","status":"ok","owner":"amy"}',
      '{"at":"","job":"a/job","status":"ok","owner":"amy"}',
      '{"at":"2026-10-28T23:00:02-05:00","job":"","status":"ok","owner":"amy"}',
      '{"at":"2026-10-28T23:00:03-05:00","job":"a/job","status":"skipped","owner":"amy"}',
      '{"at":1730160000,"job":"a/job","status":"ok","owner":"amy"}',
      '',
      '{"at":"2026-10-29T00:30:00-05:00","job":"a/job","status":"fail","owner":null,"error":"disk full"}',
    ];
    const night = readNight(runsDirWith({ '2026-10-28.jsonl': lines.join('\r\n') + '\r\n' }), '2026-10-28');
    expect(night?.badLines).toBe(11);
    expect(night?.counts).toEqual({ ok: 1, retry: 0, fail: 1 });
    expect(night?.rows).toStrictEqual([
      {
        job: 'a/job',
        owner: 'amy',
        runs: 2,
        retries: 0,
        lastStatus: 'fail',
        lastError: 'disk full',
        firstAt: '2026-10-28T23:00:00-05:00',
        lastAt: '2026-10-29T00:30:00-05:00',
      },
    ]);
  });

  it('owner: latest string owner, else null; error: latest string error, else null', () => {
    const lines = [
      '{"at":"2026-10-28T23:00:00Z","job":"b","status":"retry","owner":"amy","error":"first"}',
      '{"at":"2026-10-28T23:01:00Z","job":"b","status":"retry","owner":"bo","error":42}',
      '{"at":"2026-10-28T23:02:00Z","job":"b","status":"ok","owner":7}',
      '{"at":"2026-10-28T23:03:00Z","job":"a","status":"ok"}',
      '{"at":"2026-10-28T23:04:00Z","job":"B","status":"ok","owner":null}',
    ];
    const night = readNight(runsDirWith({ '2026-10-28.jsonl': lines.join('\n') }), '2026-10-28');
    expect(night?.badLines).toBe(0);
    // Plain string order: 'B' (0x42) sorts before 'a' and 'b'.
    expect(night?.rows.map((r) => r.job)).toEqual(['B', 'a', 'b']);
    const b = night?.rows.find((r) => r.job === 'b');
    expect(b).toMatchObject({ owner: 'bo', runs: 3, retries: 2, lastStatus: 'ok', lastError: 'first' });
    expect(night?.rows.find((r) => r.job === 'a')?.owner).toBeNull();
    expect(night?.rows.find((r) => r.job === 'B')?.owner).toBeNull();
    expect(night?.counts).toEqual({ ok: 3, retry: 2, fail: 0 });
  });
});
