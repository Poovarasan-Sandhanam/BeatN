import { computeInsights, greetingFor, groupByDay } from '../journalInsights';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const NOW = at(2026, 10, 21, 20);
const item = (createdAt: number, durationMs = 60_000, id = String(createdAt)) => ({
  id,
  createdAt,
  audio: { durationMs },
});

describe('computeInsights', () => {
  it('is all zeros for an empty journal', () => {
    expect(computeInsights([], NOW)).toEqual({ streakDays: 0, thisWeek: 0, totalMinutes: 0 });
  });

  it('counts consecutive days ending today', () => {
    const entries = [item(at(2026, 10, 21)), item(at(2026, 10, 20)), item(at(2026, 10, 19)), item(at(2026, 10, 17))];
    expect(computeInsights(entries, NOW).streakDays).toBe(3);
  });

  it('keeps a streak alive until the end of today', () => {
    const entries = [item(at(2026, 10, 20)), item(at(2026, 10, 19))];
    expect(computeInsights(entries, NOW).streakDays).toBe(2);
  });

  it('breaks a streak after a missed day', () => {
    expect(computeInsights([item(at(2026, 10, 19))], NOW).streakDays).toBe(0);
  });

  it('counts several entries on one day once for the streak', () => {
    const entries = [item(at(2026, 10, 21, 9)), item(at(2026, 10, 21, 18))];
    expect(computeInsights(entries, NOW).streakDays).toBe(1);
  });

  it('counts the last seven days and total minutes', () => {
    const entries = [item(at(2026, 10, 21), 90_000), item(at(2026, 10, 15), 30_000), item(at(2026, 10, 14), 60_000)];
    const insights = computeInsights(entries, NOW);
    expect(insights.thisWeek).toBe(2);
    expect(insights.totalMinutes).toBe(3);
  });
});

describe('groupByDay', () => {
  it('groups adjacent entries from the same day, preserving order', () => {
    const entries = [
      item(at(2026, 10, 21, 18), 1, 'a'),
      item(at(2026, 10, 21, 9), 1, 'b'),
      item(at(2026, 10, 20, 9), 1, 'c'),
    ];
    const sections = groupByDay(entries, NOW);
    expect(sections.map((s) => s.title)).toEqual(['Today', 'Yesterday']);
    expect(sections[0].data.map((e) => e.id)).toEqual(['a', 'b']);
    expect(sections[1].data.map((e) => e.id)).toEqual(['c']);
  });

  it('is empty for no entries', () => {
    expect(groupByDay([], NOW)).toEqual([]);
  });
});

describe('greetingFor', () => {
  it.each([
    [3, 'Still up?'],
    [8, 'Good morning'],
    [14, 'Good afternoon'],
    [19, 'Good evening'],
    [23, 'Good night'],
  ])('at %i:00 says %s', (hour, greeting) => {
    expect(greetingFor(at(2026, 10, 21, hour))).toBe(greeting);
  });
});
