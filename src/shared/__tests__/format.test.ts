import { formatBytes, formatDuration } from '../format';

describe('formatBytes', () => {
  it('uses one decimal place for gigabytes', () => {
    expect(formatBytes(1_180_000_000)).toBe('1.2 GB');
  });

  it('uses whole megabytes', () => {
    expect(formatBytes(59_700_000)).toBe('60 MB');
  });

  it('falls back to kilobytes for small values', () => {
    expect(formatBytes(2_048)).toBe('2 kB');
  });

  it('never renders a confusing zero or negative', () => {
    expect(formatBytes(0)).toBe('0 MB');
    expect(formatBytes(-5)).toBe('0 MB');
    expect(formatBytes(NaN)).toBe('0 MB');
  });
});

describe('formatDuration', () => {
  it('pads seconds', () => {
    expect(formatDuration(65_000)).toBe('1:05');
  });

  it('renders zero as 0:00', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('clamps negatives', () => {
    expect(formatDuration(-1000)).toBe('0:00');
  });
});
