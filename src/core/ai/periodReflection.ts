/**
 * The words for a period on the Insights screen.
 *
 * The model is handed the computed statistics (see domain/insights) and a few
 * entry summaries, and asked only to put them into words: an overview, the
 * patterns, a few small suggestions, and a hedged outlook. It never sees a
 * transcript and never produces a number of its own.
 */
import { z } from 'zod';

import type { Mood } from '../../domain/entry/JournalEntry';
import { toSecondPerson } from '../../domain/entry/secondPerson';
import { WEEKDAY_NAMES, type DayKey, type PeriodStats } from '../../domain/insights/periodInsights';

export const PeriodReflectionSchema = z.object({
  overview: z.string().min(1).max(500),
  patterns: z.array(z.string().min(1).max(200)).max(3),
  suggestions: z.array(z.string().min(1).max(200)).min(1).max(3),
  outlook: z.string().min(1).max(400),
});

export type PeriodReflection = z.infer<typeof PeriodReflectionSchema>;

/** Shape-only schema for the engine interface; validation happens in `validatePeriodReflection`. */
export const periodReflectionJsonSchema: object = z.toJSONSchema(PeriodReflectionSchema);

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const lines = (value: unknown, max: number, count: number) =>
  (Array.isArray(value) ? value : typeof value === 'string' ? [value] : [])
    .map((item) => text(item, max))
    .filter(Boolean)
    .slice(0, count);

/** Repairs near-misses (a lone string for a list, over-long text) before validating. */
export function validatePeriodReflection(value: unknown): PeriodReflection {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  // Spoken to the person, never about them — see secondPerson.ts.
  return PeriodReflectionSchema.parse({
    overview: toSecondPerson(text(raw.overview, 500)),
    patterns: lines(raw.patterns, 200, 3).map(toSecondPerson),
    suggestions: lines(raw.suggestions, 200, 3).map(toSecondPerson),
    outlook: toSecondPerson(text(raw.outlook, 400)),
  });
}

export interface EntryNote {
  createdAt: number;
  mood: Mood | null;
  summary: string;
}

/** Enough to ground the words without overflowing a 2,048-token context. */
const MAX_NOTES = 12;
const NOTE_CHARS = 160;

/** Picks notes spread evenly across the period, so one busy day cannot crowd out the rest. */
export function spreadNotes(notes: readonly EntryNote[], max: number = MAX_NOTES): EntryNote[] {
  const sorted = [...notes].sort((a, b) => a.createdAt - b.createdAt);
  if (sorted.length <= max) return sorted;
  const step = (sorted.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => sorted[Math.round(i * step)]);
}

const shortDate = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

const describeDays = (days: readonly DayKey[]) => `${days.length} day${days.length === 1 ? '' : 's'}`;

export function buildPeriodPrompt(stats: PeriodStats, notes: readonly EntryNote[], periodLabel: string): string {
  const moods = Object.entries(stats.moodCounts)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .map(([mood, count]) => `${mood} ${count}`)
    .join(', ');
  const energy = stats.energyCounts;
  const measuredEnergy = energy.low + energy.typical + energy.high;

  const facts = [
    `Period: ${periodLabel} (${describeDays(stats.days)}, ${stats.daysWithEntries} with entries).`,
    `Entries: ${stats.entryCount}. Minutes spoken: ${stats.totalMinutes}.`,
    moods ? `Moods: ${moods}. Most common: ${stats.dominantMood}.` : 'Moods: not enough to say.',
    `Direction across the period: ${stats.trend}.`,
    measuredEnergy > 0
      ? `Voice energy: low ${energy.low}, typical ${energy.typical}, high ${energy.high}.`
      : null,
    stats.topics.length > 0
      ? `Topics: ${stats.topics.slice(0, 6).map((t) => `${t.name} (${t.mentions})`).join(', ')}.`
      : null,
    stats.liftingTopics.length > 0
      ? `Topics on brighter days: ${stats.liftingTopics.map((t) => t.name).join(', ')}.`
      : null,
    stats.heavyTopics.length > 0
      ? `Topics on heavier days: ${stats.heavyTopics.map((t) => t.name).join(', ')}.`
      : null,
    stats.bestWeekday !== null && stats.hardestWeekday !== null
      ? `Brightest weekday: ${WEEKDAY_NAMES[stats.bestWeekday]}. Hardest: ${WEEKDAY_NAMES[stats.hardestWeekday]}.`
      : null,
  ].filter(Boolean);

  const entryLines = spreadNotes(notes).map(
    (note) =>
      `- ${shortDate(note.createdAt)}${note.mood && note.mood !== 'unknown' ? ` (${note.mood})` : ''}: ${note.summary.slice(0, NOTE_CHARS)}`,
  );

  return [
    'You help someone understand a stretch of their personal voice journal. Reply with one JSON object and nothing else.',
    '',
    'Schema:',
    '{"overview": string, "patterns": [string], "suggestions": [string], "outlook": string}',
    '',
    `Rules:
- Speak to them as "you" — never "the person" or "the user". Warm and plain. Use only the facts and entries below; never invent numbers or events.
- overview: two or three sentences on how this period went overall.
- patterns: up to 3 things that tend to go together (topics, weekdays, energy), each one sentence. Empty list if none stand out.
- suggestions: 2 or 3 small, specific things to try in daily life or mindset, each doable in a day, each tied to something in the data.
- outlook: one or two sentences on what may continue if nothing changes, and one hopeful possibility. Use "may" and "if"; never certain.
- If there are fewer than 3 entries, say kindly that there is not much to go on yet.
- Do not diagnose or use clinical words. This is a journal, not therapy.`,
    '',
    'Facts:',
    ...facts,
    '',
    'Entries:',
    ...(entryLines.length > 0 ? entryLines : ['(none)']),
    '',
    'JSON:',
  ].join('\n');
}
