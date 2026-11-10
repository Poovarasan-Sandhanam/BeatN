/**
 * When the journal locks. Pure, so the rules are tested rather than eyeballed.
 */

/** Away for at least this long and the journal asks for Face ID again. */
export const LOCK_AFTER_MS = 30_000;

/**
 * Whether returning to the app should lock it. Quick hops — replying to a
 * message, checking the time — do not; leaving the phone for half a minute does.
 */
export function shouldLockOnReturn(leftAt: number | null, now: number): boolean {
  if (leftAt === null) return false;
  return now - leftAt >= LOCK_AFTER_MS;
}
