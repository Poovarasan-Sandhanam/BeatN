/**
 * Exponential backoff with a ceiling.
 *
 * Pure, so the schedule is testable without waiting for real time to pass.
 * A failing transcription should not retry in a tight loop — it will usually
 * be failing for a reason that takes a while to change (no storage, model
 * evicted, device too hot).
 */

export const BASE_BACKOFF_MS = 2_000;
export const MAX_BACKOFF_MS = 5 * 60_000;

/** Delay before attempt N+1, given that N attempts have now failed. */
export function backoffMs(
  attempts: number,
  baseMs: number = BASE_BACKOFF_MS,
  maxMs: number = MAX_BACKOFF_MS,
): number {
  if (attempts <= 0) return 0;
  // 2^(attempts-1) grows fast; Math.min caps it before it overflows anything.
  const exponential = baseMs * 2 ** (attempts - 1);
  return Math.min(exponential, maxMs);
}

/** When a job that has just failed becomes claimable again. */
export function nextAttemptAt(now: number, attempts: number): number {
  return now + backoffMs(attempts);
}
