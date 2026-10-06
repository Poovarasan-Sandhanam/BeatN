/**
 * The single worker that drains the job queue.
 *
 * One worker, deliberately. Concurrency is the InferenceArbiter's problem —
 * running two jobs at once here would just queue behind it anyway, while
 * doubling the resident model pressure.
 *
 * The queue never throws at the caller: a handler failure is recorded against
 * the job and retried with backoff. A background pipeline that can crash the
 * app is worse than one that is slow.
 */

import type { JobHandler, JobStore, JobType, ProcessingJob } from './types';

export interface ProcessingQueueOptions {
  /** How often to look for work when the queue was last empty. */
  idlePollMs?: number;
  /** How often a running job reports it is still alive. */
  heartbeatMs?: number;
  /** A `running` job older than this with no heartbeat is treated as abandoned. */
  staleAfterMs?: number;
  now?: () => number;
  /** Injected so tests do not wait in real time. */
  sleep?: (ms: number) => Promise<void>;
  /** Called after each job settles — lets the UI refresh without polling the DB. */
  onJobSettled?: (job: ProcessingJob, outcome: 'completed' | 'failed') => void;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Hand control back to the event loop for one macrotask.
 *
 * Load-bearing. `await` on an already-resolved promise only drains the
 * *microtask* queue, so a drain loop whose every await resolves immediately
 * never lets timers, I/O or React rendering run — it pins the JS thread and
 * the app freezes. One real macrotask per iteration guarantees it cannot.
 */
const yieldToEventLoop = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export class ProcessingQueue {
  private running = false;
  private loop: Promise<void> | null = null;
  private wakeUp: (() => void) | null = null;

  private readonly handlers = new Map<JobType, JobHandler>();
  private readonly idlePollMs: number;
  private readonly heartbeatMs: number;
  private readonly staleAfterMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly store: JobStore,
    options: ProcessingQueueOptions = {},
  ) {
    this.idlePollMs = options.idlePollMs ?? 1_000;
    this.heartbeatMs = options.heartbeatMs ?? 10_000;
    this.staleAfterMs = options.staleAfterMs ?? 60_000;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;
    this.onJobSettled = options.onJobSettled;
  }

  private readonly onJobSettled?: ProcessingQueueOptions['onJobSettled'];

  register(type: JobType, handler: JobHandler): void {
    this.handlers.set(type, handler);
  }

  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Begin draining. Recovers jobs abandoned by a previous run first — that
   * reclaim is what makes an app kill mid-transcription survivable.
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    await this.store.recoverStale(this.now(), this.staleAfterMs);
    this.loop = this.drain();
  }

  /** Stop after the job in flight finishes. Does not abandon work mid-way. */
  async stop(): Promise<void> {
    this.running = false;
    this.nudge();
    await this.loop;
    this.loop = null;
  }

  /** Tell the worker that new work exists, instead of waiting for the next poll. */
  nudge(): void {
    this.wakeUp?.();
    this.wakeUp = null;
  }

  private async drain(): Promise<void> {
    while (this.running) {
      // Unconditional, before any work: see `yieldToEventLoop`.
      await yieldToEventLoop();
      if (!this.running) break;

      let job: ProcessingJob | null = null;
      try {
        job = await this.store.claimNext(this.now());
      } catch {
        // A failed claim must not kill the worker; back off and retry.
        await this.idle();
        continue;
      }

      if (!job) {
        await this.idle();
        continue;
      }

      await this.run(job);
    }
  }

  private async run(job: ProcessingJob): Promise<void> {
    const handler = this.handlers.get(job.type);

    if (!handler) {
      // An unknown type will never succeed, so burn its attempts rather than
      // spinning on it forever.
      await this.store.fail(job.id, `NO_HANDLER_FOR_JOB_TYPE:${job.type}`, this.now());
      this.onJobSettled?.(job, 'failed');
      return;
    }

    const beat = setInterval(() => {
      void this.store.heartbeat(job.id, this.now()).catch(() => {
        // A missed heartbeat only risks the job being reclaimed later.
      });
    }, this.heartbeatMs);

    try {
      await handler(job);
      await this.store.complete(job.id, this.now());
      this.onJobSettled?.(job, 'completed');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Error *codes* only — a handler must never put content in a message.
      await this.store.fail(job.id, message, this.now());
      this.onJobSettled?.(job, 'failed');
    } finally {
      clearInterval(beat);
    }
  }

  /** Wait for either a nudge or the poll interval, whichever comes first. */
  private async idle(): Promise<void> {
    if (!this.running) return;
    await Promise.race([
      this.sleep(this.idlePollMs),
      new Promise<void>((resolve) => {
        this.wakeUp = resolve;
      }),
    ]);
  }
}
