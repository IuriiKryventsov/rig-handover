import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { readNight } from './digest/read.js';
import type { StatusCounts } from './digest/types.js';
import { lastBeat, type Beat } from './heartbeat.js';

// A night on disk, with its log lines by status; counts is null if the night can't be read.
export type NightSummary = {
  night: string;
  counts: StatusCounts | null;
};

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightSummary[];
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

// readNight returns null for a night it can't find and throws on other read errors; neither
// should take the board down or drop the night, so both give counts: null (shown as '—').
function countsOf(runsDir: string, night: string): StatusCounts | null {
  try {
    return readNight(runsDir, night)?.counts ?? null;
  } catch {
    return null;
  }
}

export function summarizeNights(runsDir: string): NightSummary[] {
  return nightsOnDisk(runsDir).map((night) => ({ night, counts: countsOf(runsDir, night) }));
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: summarizeNights(config.runsDir),
  };
}
