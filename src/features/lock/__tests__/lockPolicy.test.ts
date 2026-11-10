import { LOCK_AFTER_MS, shouldLockOnReturn } from '../lockPolicy';

describe('shouldLockOnReturn', () => {
  it('does not lock if the app never went to the background', () => {
    expect(shouldLockOnReturn(null, 1_000_000)).toBe(false);
  });

  it('does not lock after a quick hop to another app', () => {
    expect(shouldLockOnReturn(1_000, 1_000 + LOCK_AFTER_MS - 1)).toBe(false);
  });

  it('locks once the phone has been away long enough', () => {
    expect(shouldLockOnReturn(1_000, 1_000 + LOCK_AFTER_MS)).toBe(true);
    expect(shouldLockOnReturn(1_000, 1_000 + 10 * 60_000)).toBe(true);
  });
});
