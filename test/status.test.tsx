import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('shows the lane banner and the nights on disk', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('2026-10-28');
  });

  it('links each night to its digest, with its counts, newest first', async () => {
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('href="/digest/2026-10-28"');
    expect(html).toContain('href="/digest/2026-10-27"');
    expect(html).toContain('ok 10 · retry 4 · fail 1');
    expect(html).toContain('ok 7 · retry 0 · fail 0');
    expect(html.indexOf('2026-10-28')).toBeLessThan(html.indexOf('2026-10-27'));
  });

  it('lists a night it cannot read, with — for the counts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-status-'));
    try {
      mkdirSync(join(dir, '2026-10-26.jsonl'));
      writeFileSync(join(dir, '2026-10-25.jsonl'), '{"at":"2026-10-25T01:00:00+01:00","job":"a","status":"ok"}\n');
      const res = await createApp({ ...config, runsDir: dir }).request('/');
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain('href="/digest/2026-10-26"');
      expect(html).toContain('>—<');
      expect(html).toContain('ok 1 · retry 0 · fail 0');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });
});
