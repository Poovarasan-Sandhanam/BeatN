import type { JournalEntry } from '../../domain/entry/JournalEntry';
import { formatEntryDate } from './entryStatus';

const DAY_MS = 86_400_000;

type Dated = Pick<JournalEntry, 'createdAt'> & { audio: Pick<JournalEntry['audio'], 'durationMs'> };

function startOfDay(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Whole local days between two timestamps, robust to DST's 23/25-hour days. */
function dayDiff(later: number, earlier: number): number {
  return Math.round((startOfDay(later) - startOfDay(earlier)) / DAY_MS);
}

export interface JournalInsights {
  /** Consecutive days with an entry, ending today — or yesterday, so it is not lost before you record. */
  streakDays: number;
  /** Entries in the last seven days, today included. */
  thisWeek: number;
  /** Total minutes spoken, rounded. */
  totalMinutes: number;
}

export function computeInsights(entries: readonly Dated[], now: number = Date.now()): JournalInsights {
  const daysWithEntries = new Set(entries.map((entry) => dayDiff(now, entry.createdAt)));

  let streakDays = 0;
  let cursor = daysWithEntries.has(0) ? 0 : daysWithEntries.has(1) ? 1 : -1;
  while (cursor >= 0 && daysWithEntries.has(cursor)) {
    streakDays += 1;
    cursor += 1;
  }

  const thisWeek = entries.filter((entry) => {
    const days = dayDiff(now, entry.createdAt);
    return days >= 0 && days < 7;
  }).length;

  const totalMs = entries.reduce((sum, entry) => sum + Math.max(0, entry.audio.durationMs), 0);

  return { streakDays, thisWeek, totalMinutes: Math.round(totalMs / 60_000) };
}

export interface DaySection<T> {
  /** Stable key: the local start-of-day timestamp. */
  key: string;
  title: string;
  data: T[];
}

/** Groups entries into day sections, preserving the input order. */
export function groupByDay<T extends Dated>(entries: readonly T[], now: number = Date.now()): DaySection<T>[] {
  const sections: DaySection<T>[] = [];
  for (const entry of entries) {
    const key = String(startOfDay(entry.createdAt));
    const last = sections[sections.length - 1];
    if (last && last.key === key) {
      last.data.push(entry);
    } else {
      sections.push({ key, title: formatEntryDate(entry.createdAt, now), data: [entry] });
    }
  }
  return sections;
}

/** A greeting that knows what time it is. */
export function greetingFor(timestamp: number = Date.now()): string {
  const hour = new Date(timestamp).getHours();
  if (hour < 5) return 'Still up?';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 22) return 'Good evening';
  return 'Good night';
}

/** "Wednesday, 21 October" */
export function formatLongDate(timestamp: number = Date.now()): string {
  return new Date(timestamp).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}
