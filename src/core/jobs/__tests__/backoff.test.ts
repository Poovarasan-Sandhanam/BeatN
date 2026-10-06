import { BASE_BACKOFF_MS, MAX_BACKOFF_MS, backoffMs, nextAttemptAt } from '../backoff';

describe('backoffMs', () => {
  it('is zero before any attempt has failed', () => {
    expect(backoffMs(0)).toBe(0);
    expect(backoffMs(-1)).toBe(0);
  });

  it('doubles with each failure', () => {
    expect(backoffMs(1)).toBe(BASE_BACKOFF_MS);
    expect(backoffMs(2)).toBe(BASE_BACKOFF_MS * 2);
    expect(backoffMs(3)).toBe(BASE_BACKOFF_MS * 4);
  });

  it('never exceeds the ceiling, however many failures', () => {
    expect(backoffMs(50)).toBe(MAX_BACKOFF_MS);
    expect(backoffMs(1000)).toBe(MAX_BACKOFF_MS);
    expect(Number.isFinite(backoffMs(1000))).toBe(true);
  });

  it('honours custom base and cap', () => {
    expect(backoffMs(3, 100, 1000)).toBe(400);
    expect(backoffMs(10, 100, 1000)).toBe(1000);
  });
});

describe('nextAttemptAt', () => {
  it('pushes the job into the future by the backoff', () => {
    expect(nextAttemptAt(10_000, 1)).toBe(10_000 + BASE_BACKOFF_MS);
  });

  it('is immediate when nothing has failed', () => {
    expect(nextAttemptAt(10_000, 0)).toBe(10_000);
  });
});
