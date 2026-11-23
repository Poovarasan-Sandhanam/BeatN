import { PERIOD_PRESETS, describeSelection } from '../periodPresets';

describe('describeSelection', () => {
  it.each([
    ['3d', 'Last 3 days'],
    ['7d', 'Last 7 days'],
    ['month', 'This month'],
    ['30d', 'Last 30 days'],
    ['90d', 'Last 3 months'],
  ])('names preset %s as %p', (id, label) => {
    expect(describeSelection([], id)).toBe(label);
  });

  it('describes hand-picked days by count', () => {
    expect(describeSelection(['2026-11-02'], null)).toBe('1 chosen day');
    expect(describeSelection(['2026-11-02', '2026-11-09'], null)).toBe('2 chosen days');
  });

  it('gives every preset the number of days its name promises', () => {
    const now = new Date(2026, 10, 23, 12).getTime();
    const lengths = Object.fromEntries(PERIOD_PRESETS.map((p) => [p.id, p.days(now).length]));
    expect(lengths).toEqual({ '3d': 3, '7d': 7, month: 23, '30d': 30, '90d': 90 });
  });
});
