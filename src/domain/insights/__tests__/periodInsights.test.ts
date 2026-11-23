import type { Mood } from '../../entry/JournalEntry';
import {
  computePeriodStats,
  dayKey,
  dayStart,
  lastDays,
  thisMonth,
  type InsightEntry,
} from '../periodInsights';

/** Noon on a day in November 2026 (local time), so time zones never move the day. */
const nov = (date: number, hour = 12) => new Date(2026, 10, date, hour).getTime();

const entry = (date: number, mood: Mood | null, topics: string[] = [], extra: Partial<InsightEntry> = {}): InsightEntry => ({
  createdAt: nov(date),
  durationMs: 60_000,
  mood,
  topics,
  energy: null,
  ...extra,
});

const week = lastDays(7, nov(23));

describe('day keys and presets', () => {
  it('formats local days and round-trips', () => {
    expect(dayKey(nov(3))).toBe('2026-11-03');
    expect(dayKey(dayStart('2026-11-03'))).toBe('2026-11-03');
  });

  it('gives the last N days ending today, oldest first', () => {
    expect(lastDays(3, nov(23))).toEqual(['2026-11-21', '2026-11-22', '2026-11-23']);
  });

  it('crosses month boundaries', () => {
    expect(lastDays(3, nov(1))).toEqual(['2026-10-30', '2026-10-31', '2026-11-01']);
  });

  it('gives this month up to today', () => {
    const days = thisMonth(nov(5));
    expect(days[0]).toBe('2026-11-01');
    expect(days).toHaveLength(5);
  });
});

describe('computePeriodStats', () => {
  it('counts only entries inside the chosen days, keeping empty days in the timeline', () => {
    const stats = computePeriodStats([entry(23, 'calm'), entry(10, 'sad')], week);
    expect(stats.entryCount).toBe(1);
    expect(stats.days).toHaveLength(7);
    expect(stats.daysWithEntries).toBe(1);
    expect(stats.daily.find((d) => d.day === '2026-11-20')).toMatchObject({ entries: 0, valence: null });
  });

  it('works with any combination of days, not just ranges', () => {
    const picked = ['2026-11-02', '2026-11-16', '2026-11-23'];
    const stats = computePeriodStats([entry(2, 'happy'), entry(9, 'sad'), entry(16, 'calm'), entry(23, 'calm')], picked);
    expect(stats.entryCount).toBe(3);
    expect(stats.moodCounts).toEqual({ happy: 1, calm: 2 });
  });

  it('finds the dominant mood and ignores "unknown"', () => {
    const stats = computePeriodStats(
      [entry(20, 'tired'), entry(21, 'tired'), entry(22, 'calm'), entry(23, 'unknown')],
      week,
    );
    expect(stats.dominantMood).toBe('tired');
    expect(stats.moodCounts.unknown).toBeUndefined();
  });

  it('sees a week getting brighter as improving', () => {
    const stats = computePeriodStats(
      [entry(17, 'sad'), entry(18, 'stressed'), entry(20, 'neutral'), entry(22, 'calm'), entry(23, 'happy')],
      week,
    );
    expect(stats.trend).toBe('improving');
  });

  it('sees a week getting heavier as declining', () => {
    const stats = computePeriodStats([entry(17, 'happy'), entry(19, 'calm'), entry(21, 'tired'), entry(23, 'sad')], week);
    expect(stats.trend).toBe('declining');
  });

  it('calls a flat week steady, and too few days unclear', () => {
    expect(computePeriodStats([entry(17, 'calm'), entry(20, 'calm'), entry(23, 'calm')], week).trend).toBe('steady');
    expect(computePeriodStats([entry(22, 'sad'), entry(23, 'happy')], week).trend).toBe('unclear');
  });

  it('spots topics that come with brighter and heavier entries', () => {
    const stats = computePeriodStats(
      [
        entry(17, 'happy', ['running']),
        entry(18, 'calm', ['running', 'family']),
        entry(19, 'stressed', ['work']),
        entry(20, 'sad', ['work']),
        // Family comes with one calm and one tired day: mixed, so not called out.
        entry(21, 'tired', ['family']),
      ],
      week,
    );
    expect(stats.liftingTopics.map((t) => t.name)).toEqual(['running']);
    expect(stats.heavyTopics.map((t) => t.name)).toEqual(['work']);
    expect(stats.topics[0]).toMatchObject({ mentions: 2 });
  });

  it('needs at least two mentions before calling a topic out', () => {
    const stats = computePeriodStats([entry(20, 'happy', ['party']), entry(21, 'sad'), entry(22, 'neutral')], week);
    expect(stats.liftingTopics).toEqual([]);
  });

  it('names best and hardest weekdays only with enough evidence', () => {
    // Mondays (2, 9, 16) heavy, Saturdays (7, 14, 21) bright, over a month.
    const month = thisMonth(nov(23));
    const stats = computePeriodStats(
      [entry(2, 'stressed'), entry(9, 'sad'), entry(16, 'tired'), entry(7, 'happy'), entry(14, 'calm'), entry(21, 'happy')],
      month,
    );
    expect(stats.hardestWeekday).toBe(1);
    expect(stats.bestWeekday).toBe(6);

    const sparse = computePeriodStats([entry(2, 'sad'), entry(7, 'happy')], month);
    expect(sparse.bestWeekday).toBeNull();
  });

  it('tallies vocal energy and spoken minutes', () => {
    const stats = computePeriodStats(
      [
        entry(22, 'calm', [], { energy: 'low', durationMs: 90_000 }),
        entry(23, 'calm', [], { energy: 'low', durationMs: 30_000 }),
        entry(23, 'happy', [], { energy: 'high' }),
      ],
      week,
    );
    expect(stats.energyCounts).toEqual({ low: 2, typical: 0, high: 1 });
    expect(stats.totalMinutes).toBe(3);
  });

  it('is calm about an empty period', () => {
    const stats = computePeriodStats([], week);
    expect(stats).toMatchObject({ entryCount: 0, dominantMood: null, averageValence: null, trend: 'unclear' });
  });

  it('lists every entry in order for entry-by-entry charts', () => {
    const stats = computePeriodStats(
      [entry(23, 'happy', [], { createdAt: nov(23, 15) }), entry(23, 'sad', [], { createdAt: nov(23, 9) })],
      week,
    );
    expect(stats.timeline).toEqual([
      { at: nov(23, 9), valence: -0.9, mood: 'sad' },
      { at: nov(23, 15), valence: 1, mood: 'happy' },
    ]);
  });
});

