import { computePeriodStats, lastDays } from '../../../domain/insights/periodInsights';
import { buildPeriodPrompt, spreadNotes, validatePeriodReflection, type EntryNote } from '../periodReflection';

const nov = (date: number) => new Date(2026, 10, date, 12).getTime();
const note = (date: number, summary = `Day ${date}.`): EntryNote => ({ createdAt: nov(date), mood: 'calm', summary });

describe('validatePeriodReflection', () => {
  const good = {
    overview: 'A steadier week.',
    patterns: ['Work days were heavier.'],
    suggestions: ['Take a short walk after work.'],
    outlook: 'This may continue if you keep the walks.',
  };

  it('accepts a good reply', () => {
    expect(validatePeriodReflection(good)).toEqual(good);
  });

  it('repairs a lone string where a list belongs', () => {
    expect(validatePeriodReflection({ ...good, suggestions: 'Sleep earlier.' }).suggestions).toEqual(['Sleep earlier.']);
  });

  it('keeps at most three of each, and drops blanks', () => {
    const result = validatePeriodReflection({ ...good, patterns: ['a', '', 'b', 'c', 'd'] });
    expect(result.patterns).toEqual(['a', 'b', 'c']);
  });

  it('rejects a reply with no suggestions or no overview — that is a failed reply', () => {
    expect(() => validatePeriodReflection({ ...good, suggestions: [] })).toThrow();
    expect(() => validatePeriodReflection({ ...good, overview: '' })).toThrow();
    expect(() => validatePeriodReflection('text')).toThrow();
  });
});

describe('spreadNotes', () => {
  it('keeps everything when there is room, oldest first', () => {
    expect(spreadNotes([note(3), note(1), note(2)]).map((n) => n.createdAt)).toEqual([nov(1), nov(2), nov(3)]);
  });

  it('samples evenly across a long period, keeping the first and last', () => {
    const many = Array.from({ length: 30 }, (_, i) => note(i + 1));
    const picked = spreadNotes(many, 5);
    expect(picked).toHaveLength(5);
    expect(picked[0].createdAt).toBe(nov(1));
    expect(picked[4].createdAt).toBe(nov(30));
  });
});

describe('buildPeriodPrompt', () => {
  const days = lastDays(7, nov(23));
  const stats = computePeriodStats(
    [
      { createdAt: nov(20), durationMs: 60_000, mood: 'stressed', topics: ['work'], energy: 'low' },
      { createdAt: nov(21), durationMs: 60_000, mood: 'stressed', topics: ['work'], energy: 'low' },
      { createdAt: nov(22), durationMs: 60_000, mood: 'happy', topics: ['running'], energy: 'high' },
      { createdAt: nov(23), durationMs: 60_000, mood: 'happy', topics: ['running'], energy: 'typical' },
    ],
    days,
  );
  const prompt = buildPeriodPrompt(stats, [note(20, 'Long day at work.')], 'Last 7 days');

  it('hands over the computed facts, so the model never makes numbers up', () => {
    expect(prompt).toContain('Period: Last 7 days (7 days, 4 with entries).');
    expect(prompt).toContain('Entries: 4.');
    expect(prompt).toContain('Direction across the period: improving.');
    expect(prompt).toContain('Voice energy: low 2, typical 1, high 1.');
    expect(prompt).toContain('Topics on brighter days: running.');
    expect(prompt).toContain('Topics on heavier days: work.');
  });

  it('includes entry summaries with their mood', () => {
    expect(prompt).toMatch(/- Fri 20 Nov \(calm\): Long day at work\./);
  });

  it('asks for hedged, non-clinical, grounded writing', () => {
    expect(prompt).toContain('never invent numbers or events');
    expect(prompt).toContain('Use "may" and "if"');
    expect(prompt).toContain('Do not diagnose');
  });

  it('says so when there is nothing to go on', () => {
    const empty = buildPeriodPrompt(computePeriodStats([], days), [], 'Last 7 days');
    expect(empty).toContain('(none)');
    expect(empty).toContain('Moods: not enough to say.');
  });
});
