import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';
import type { DigestNight } from '../src/digest/types.js';

// Routes 2a (/digest/:night) and 2b (/api/digest/:night), through app.request(). The runs dir is
// a temp dir: runs/ is read-only fixtures, so its real night is copied in, never written to.
const realNight = fileURLToPath(new URL('../runs/2026-10-28.jsonl', import.meta.url));

const MIXED = [
  '{"at":"2026-10-20T23:00:00+02:00","job":"zeta/job","status":"ok","owner":"zed"}',
  '{"at":"2026-10-21T01:00:00+02:00","job":"alpha/job","status":"retry","owner":"amy","error":"timeout"}',
  '{"at":"2026-10-21T01:05:00+02:00","job":"alpha/job","status":"ok","owner":"amy"}',
  '{"at":"2026-10-21T02:00:00+02:00","job":"Beta/job","status":"fail","owner":null,"error":"disk full"}',
  '',
].join('\n');

const WITH_BAD_LINE = [
  '{"at":"2026-10-22T01:00:00+02:00","job":"b/job","status":"ok","owner":"bo"}',
  'this is not json',
  '{"at":"2026-10-22T02:00:00+02:00","job":"a/job","status":"ok","owner":"amy"}',
  '',
].join('\n');

let tmp: string;
let runsDir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  runsDir = join(tmp, 'runs');
  mkdirSync(runsDir);
  copyFileSync(realNight, join(runsDir, '2026-10-28.jsonl'));
  writeFileSync(join(runsDir, '2026-10-20.jsonl'), MIXED);
  writeFileSync(join(runsDir, '2026-10-22.jsonl'), WITH_BAD_LINE);
  writeFileSync(join(runsDir, '2026-10-23.jsonl'), '');
  // Sits exactly where the night `../secret` would point, so a 404 there means "never read".
  writeFileSync(join(tmp, 'secret.jsonl'), MIXED);

  const config: RigConfig = {
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  };
  app = createApp(config);
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

// The job cell of every body row, in page order.
function pageJobs(html: string): string[] {
  return [...html.matchAll(/<tr[^>]*><td>([^<]*)<\/td>/g)].map((m) => m[1] ?? '');
}

async function getJson(path: string): Promise<{ status: number; body: DigestNight }> {
  const res = await app.request(path);
  return { status: res.status, body: (await res.json()) as DigestNight };
}

describe('GET /digest/:night and /api/digest/:night: a night with a file', () => {
  it('page: 200 with the jobs, the summary line and a dash for a missing owner', async () => {
    const res = await app.request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('digest · 2026-10-28');
    expect(html).toContain('ok 10 · retry 4 · fail 1 · bad lines 1');
    expect(pageJobs(html)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    // digest/render has no owner in the log: a dash, not an empty cell.
    expect(html).toContain('<td>digest/render</td><td>—</td>');
    expect(html).not.toContain('<td></td>');
    // Offsets kept as written.
    expect(html).toContain('2026-10-29T01:30:00+01:00');
  });

  it('json: 200 with night, rows, counts and badLines', async () => {
    const res = await app.request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = (await res.json()) as DigestNight;
    expect(body.night).toBe('2026-10-28');
    expect(body.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(body.rows[0]).toEqual({
      job: 'digest/render',
      owner: null,
      runs: 1,
      retries: 0,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-29T05:41:09+01:00',
      lastAt: '2026-10-29T05:41:09+01:00',
    });
  });
});

describe('GET /digest/:night and /api/digest/:night: no night', () => {
  it('page: 404 for a night with no file', async () => {
    const res = await app.request('/digest/2026-10-29');
    const html = await res.text();
    expect(res.status).toBe(404);
    expect(html).toContain('no run log for 2026-10-29');
    expect(html).not.toContain('<table');
  });

  it('json: 404 for a night with no file', async () => {
    const res = await app.request('/api/digest/2026-10-29');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ error: 'no run log for 2026-10-29' });
  });

  it.each(['..%2Fsecret', '..%2Fetc', '2026-10-28.jsonl', '2026-1-28', 'tonight'])(
    'both routes: 404 for the malformed night %s, without reading a file',
    async (night) => {
      const page = await app.request(`/digest/${night}`);
      expect(page.status).toBe(404);
      expect(await page.text()).toContain('no run log for');

      const json = await app.request(`/api/digest/${night}`);
      expect(json.status).toBe(404);
      expect(await json.json()).toEqual({ error: expect.stringContaining('no run log for') });
    },
  );

  it('page: a night from the URL is escaped, not rendered as markup', async () => {
    const res = await app.request('/digest/%3Cb%3Ex%3C%2Fb%3E');
    const html = await res.text();
    expect(res.status).toBe(404);
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});

describe('GET /digest/:night and /api/digest/:night: the empty night', () => {
  it('page: 200, says nothing ran, no table', async () => {
    const res = await app.request('/digest/2026-10-23');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(html).toContain('ok 0 · retry 0 · fail 0 · bad lines 0');
    expect(html).not.toContain('<table');
    expect(pageJobs(html)).toEqual([]);
  });

  it('json: 200, no rows, all counts zero', async () => {
    const { status, body } = await getJson('/api/digest/2026-10-23');
    expect(status).toBe(200);
    expect(body).toEqual({
      night: '2026-10-23',
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });
});

describe('GET /digest/:night and /api/digest/:night: a night with a bad line', () => {
  it('page: still 200, the good rows rendered, the bad line counted', async () => {
    const res = await app.request('/digest/2026-10-22');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('ok 2 · retry 0 · fail 0 · bad lines 1');
    expect(pageJobs(html)).toEqual(['a/job', 'b/job']);
    expect(html).not.toContain('nothing ran');
  });

  it('json: still 200, the good rows kept, badLines 1', async () => {
    const { status, body } = await getJson('/api/digest/2026-10-22');
    expect(status).toBe(200);
    expect(body.badLines).toBe(1);
    expect(body.counts).toEqual({ ok: 2, retry: 0, fail: 0 });
    expect(body.rows.map((r) => r.job)).toEqual(['a/job', 'b/job']);
  });
});

describe('GET /digest/:night and /api/digest/:night: page and JSON agree', () => {
  it.each(['2026-10-28', '2026-10-20', '2026-10-22', '2026-10-23'])(
    'night %s: same jobs in the same order, same summary line',
    async (night) => {
      const html = await (await app.request(`/digest/${night}`)).text();
      const { body } = await getJson(`/api/digest/${night}`);
      expect(pageJobs(html)).toEqual(body.rows.map((r) => r.job));
      const { ok, retry, fail } = body.counts;
      expect(html).toContain(`ok ${ok} · retry ${retry} · fail ${fail} · bad lines ${body.badLines}`);
    },
  );

  it('orders jobs in plain string order on both (B before a before z)', async () => {
    const html = await (await app.request('/digest/2026-10-20')).text();
    const { body } = await getJson('/api/digest/2026-10-20');
    expect(body.rows.map((r) => r.job)).toEqual(['Beta/job', 'alpha/job', 'zeta/job']);
    expect(pageJobs(html)).toEqual(['Beta/job', 'alpha/job', 'zeta/job']);
    expect(body.counts).toEqual({ ok: 2, retry: 1, fail: 1 });
  });
});
