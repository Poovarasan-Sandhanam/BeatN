/**
 * What a stretch of journal entries says, computed — not guessed.
 *
 * Every number on the Insights screen comes from here: plain arithmetic over
 * the entries in the chosen days. The language model is only ever handed
 * these results to put into words, so it cannot invent a statistic.
 *
 * Pure TypeScript, testable with hand-built entries.
 */
import type { Mood } from '../entry/JournalEntry';
import type { Energy } from '../voice/voiceCues';

/**
 * Where each mood sits between heavy (-1) and bright (+1). A coarse scale on
 * purpose: it orders days and spots direction, it does not measure people.
 * "unknown" carries no signal and is left out of every average.
 */
export const MOOD_VALENCE: Record<Mood, number | null> = {
  happy: 1,
  excited: 0.8,
  calm: 0.6,
  reflective: 0.3,
  neutral: 0,
  mixed: -0.1,
  tired: -0.4,
  stressed: -0.7,
  sad: -0.9,
  unknown: null,
};

/** A local calendar day, "2026-11-23". */
export type DayKey = string;

export interface InsightEntry {
  createdAt: number;
  durationMs: number;
  mood: Mood | null;
  topics: string[];
  /** Vocal energy against the person's own baseline; null when not measured. */
  energy: Energy | null;
}

export interface DaySummary {
  day: DayKey;
  entries: number;
  /** Mean valence of the day's entries; null with no usable mood. */
  valence: number | null;
  /** Most frequent mood that day; ties go to the latest entry. */
  mood: Mood | null;
}

export interface TopicStat {
  name: string;
  mentions: number;
  /** Mean valence of the entries that mention it. */
  valence: number | null;
}

export type Trend = 'improving' | 'steady' | 'declining' | 'unclear';

export interface PeriodStats {
  /** The chosen days, oldest first — including days with no entries. */
  days: DayKey[];
  daysWithEntries: number;
  entryCount: number;
  totalMinutes: number;
  moodCounts: Partial<Record<Mood, number>>;
  dominantMood: Mood | null;
  averageValence: number | null;
  trend: Trend;
  energyCounts: Record<Energy, number>;
  daily: DaySummary[];
  /** Every entry in the period, oldest first — for charting short periods entry by entry. */
  timeline: { at: number; valence: number | null; mood: Mood | null }[];
  /** Most-mentioned first. */
  topics: TopicStat[];
  /** Topics that come with brighter-than-usual entries. */
  liftingTopics: TopicStat[];
  /** Topics that come with heavier-than-usual entries. */
  heavyTopics: TopicStat[];
  /** 0 = Sunday. Null unless the period has enough entries on enough weekdays. */
  bestWeekday: number | null;
  hardestWeekday: number | null;
}

/** Days below this many with a mood cannot show a trend. */
const MIN_TREND_DAYS = 3;
/** Change across the period, in valence, that counts as movement. */
const TREND_THRESHOLD = 0.15;
/** A topic must lean this far from the period's average to be called out. */
const TOPIC_LEAN = 0.25;
const MIN_TOPIC_MENTIONS = 2;
const MIN_WEEKDAY_ENTRIES = 2;

export function dayKey(timestamp: number): DayKey {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Local midnight at the start of a day key. */
export function dayStart(day: DayKey): number {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date).getTime();
}

/** The `count` days ending with the day of `now`, oldest first. */
export function lastDays(count: number, now: number = Date.now()): DayKey[] {
  const end = new Date(now);
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (count - 1 - i));
    return dayKey(date.getTime());
  });
}

/** Every day of the month containing `now`, up to and including today. */
export function thisMonth(now: number = Date.now()): DayKey[] {
  return lastDays(new Date(now).getDate(), now);
}

const mean = (values: number[]) =>
  values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;

function valenceOf(entry: InsightEntry): number | null {
  return entry.mood ? MOOD_VALENCE[entry.mood] : null;
}

function mostFrequent<T>(items: T[]): T | null {
  const counts = new Map<T, number>();
  let best: T | null = null;
  let bestCount = 0;
  // Later items win ties, so the most recent of equally common moods leads.
  for (const item of items) {
    const count = (counts.get(item) ?? 0) + 1;
    counts.set(item, count);
    if (count >= bestCount) {
      best = item;
      bestCount = count;
    }
  }
  return best;
}

/** Least-squares slope of valence per day, times the span: the change across the period. */
function trendOf(daily: DaySummary[]): Trend {
  const points = daily
    .map((day, index) => ({ x: index, y: day.valence }))
    .filter((point): point is { x: number; y: number } => point.y !== null);
  if (points.length < MIN_TREND_DAYS) return 'unclear';

  const meanX = points.reduce((a, p) => a + p.x, 0) / points.length;
  const meanY = points.reduce((a, p) => a + p.y, 0) / points.length;
  let numerator = 0;
  let denominator = 0;
  for (const p of points) {
    numerator += (p.x - meanX) * (p.y - meanY);
    denominator += (p.x - meanX) ** 2;
  }
  if (denominator === 0) return 'unclear';
  const span = points[points.length - 1].x - points[0].x;
  const change = (numerator / denominator) * span;
  if (change >= TREND_THRESHOLD) return 'improving';
  if (change <= -TREND_THRESHOLD) return 'declining';
  return 'steady';
}

export function computePeriodStats(entries: readonly InsightEntry[], days: readonly DayKey[]): PeriodStats {
  const chosen = [...new Set(days)].sort();
  const inPeriod = new Set(chosen);
  const selected = entries
    .filter((entry) => inPeriod.has(dayKey(entry.createdAt)))
    .sort((a, b) => a.createdAt - b.createdAt);

  const byDay = new Map<DayKey, InsightEntry[]>();
  for (const entry of selected) {
    const key = dayKey(entry.createdAt);
    byDay.set(key, [...(byDay.get(key) ?? []), entry]);
  }

  const daily: DaySummary[] = chosen.map((day) => {
    const dayEntries = byDay.get(day) ?? [];
    const valences = dayEntries.map(valenceOf).filter((v): v is number => v !== null);
    const moods = dayEntries.map((e) => e.mood).filter((m): m is Mood => m !== null && m !== 'unknown');
    return { day, entries: dayEntries.length, valence: mean(valences), mood: mostFrequent(moods) };
  });

  const moodCounts: Partial<Record<Mood, number>> = {};
  for (const entry of selected) {
    if (entry.mood && entry.mood !== 'unknown') moodCounts[entry.mood] = (moodCounts[entry.mood] ?? 0) + 1;
  }

  const allValences = selected.map(valenceOf).filter((v): v is number => v !== null);
  const averageValence = mean(allValences);

  const energyCounts: Record<Energy, number> = { low: 0, typical: 0, high: 0 };
  for (const entry of selected) if (entry.energy) energyCounts[entry.energy] += 1;

  const topicEntries = new Map<string, InsightEntry[]>();
  for (const entry of selected) {
    for (const topic of new Set(entry.topics.map((t) => t.trim().toLowerCase()).filter(Boolean))) {
      topicEntries.set(topic, [...(topicEntries.get(topic) ?? []), entry]);
    }
  }
  const topics: TopicStat[] = [...topicEntries.entries()]
    .map(([name, withTopic]) => ({
      name,
      mentions: withTopic.length,
      valence: mean(withTopic.map(valenceOf).filter((v): v is number => v !== null)),
    }))
    .sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name));

  const leaning = (direction: 1 | -1) =>
    averageValence === null
      ? []
      : topics
          .filter(
            (topic) =>
              topic.mentions >= MIN_TOPIC_MENTIONS &&
              topic.valence !== null &&
              direction * (topic.valence - averageValence) >= TOPIC_LEAN,
          )
          .sort((a, b) => direction * ((b.valence ?? 0) - (a.valence ?? 0)))
          .slice(0, 3);

  const weekdayValences = new Map<number, number[]>();
  for (const entry of selected) {
    const valence = valenceOf(entry);
    if (valence === null) continue;
    const weekday = new Date(entry.createdAt).getDay();
    weekdayValences.set(weekday, [...(weekdayValences.get(weekday) ?? []), valence]);
  }
  const weekdays = [...weekdayValences.entries()]
    .filter(([, values]) => values.length >= MIN_WEEKDAY_ENTRIES)
    .map(([weekday, values]) => ({ weekday, valence: mean(values) as number }))
    .sort((a, b) => b.valence - a.valence);
  // Two weekdays at least, and a real gap between them, before naming either.
  const hasPattern = weekdays.length >= 2 && weekdays[0].valence - weekdays[weekdays.length - 1].valence >= 0.3;

  return {
    days: chosen,
    daysWithEntries: daily.filter((day) => day.entries > 0).length,
    entryCount: selected.length,
    totalMinutes: Math.round(selected.reduce((a, e) => a + e.durationMs, 0) / 60_000),
    moodCounts,
    dominantMood: mostFrequent(
      selected.map((e) => e.mood).filter((m): m is Mood => m !== null && m !== 'unknown'),
    ),
    averageValence,
    trend: trendOf(daily),
    energyCounts,
    daily,
    timeline: selected.map((entry) => ({ at: entry.createdAt, valence: valenceOf(entry), mood: entry.mood })),
    topics,
    liftingTopics: leaning(1),
    heavyTopics: leaning(-1),
    bestWeekday: hasPattern ? weekdays[0].weekday : null,
    hardestWeekday: hasPattern ? weekdays[weekdays.length - 1].weekday : null,
  };
}

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
