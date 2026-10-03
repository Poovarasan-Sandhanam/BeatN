/**
 * Serializes every inference in the app.
 *
 * There is one CPU/GPU and one set of model weights. Two concurrent
 * `transcribe()` calls, or a background embedding job overlapping a
 * user-initiated Ask, do not run twice as fast — they thrash, blow the RAM
 * budget, and get the app OOM-killed.
 *
 * So: all inference goes through here, one at a time, highest priority first.
 * This is why no component is allowed to call an engine directly.
 */

export type InferencePriority = 'interactive' | 'foreground' | 'background';

const PRIORITY_RANK: Record<InferencePriority, number> = {
  interactive: 0, // user is waiting and watching — Ask, live transcription
  foreground: 1, // user initiated, result expected soon — entry just recorded
  background: 2, // backfill, re-indexing, nobody is waiting
};

export interface InferenceTask<T> {
  label: string;
  priority: InferencePriority;
  run: (signal: AbortSignal) => Promise<T>;
  signal?: AbortSignal;
}

interface QueuedTask {
  label: string;
  priority: InferencePriority;
  /** Tie-break so equal priorities stay FIFO rather than arbitrary. */
  sequence: number;
  start: () => void;
  reject: (error: unknown) => void;
  settled: boolean;
}

export class InferenceArbiter {
  private readonly queue: QueuedTask[] = [];
  private running = false;
  private sequence = 0;

  get isBusy(): boolean {
    return this.running;
  }

  get queueDepth(): number {
    return this.queue.length;
  }

  /**
   * Queue an inference. Resolves with the task's result once it has had
   * exclusive access.
   *
   * An already-aborted signal is rejected without ever occupying the engine,
   * and aborting while queued removes the task rather than running it.
   */
  async run<T>(task: InferenceTask<T>): Promise<T> {
    if (task.signal?.aborted) {
      throw abortError(task.label);
    }

    const controller = new AbortController();
    const forwardAbort = () => controller.abort(task.signal?.reason);
    task.signal?.addEventListener('abort', forwardAbort, { once: true });

    try {
      await this.waitForTurn(task);
      // Re-check: the task may have been aborted while queued.
      if (controller.signal.aborted) throw abortError(task.label);
      return await task.run(controller.signal);
    } finally {
      task.signal?.removeEventListener('abort', forwardAbort);
      this.running = false;
      this.dispatch();
    }
  }

  private waitForTurn(task: InferenceTask<unknown>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const queued: QueuedTask = {
        label: task.label,
        priority: task.priority,
        sequence: this.sequence++,
        settled: false,
        start: () => {
          queued.settled = true;
          resolve();
        },
        reject: (error) => {
          queued.settled = true;
          reject(error);
        },
      };

      const onAbort = () => {
        if (queued.settled) return;
        const index = this.queue.indexOf(queued);
        if (index !== -1) this.queue.splice(index, 1);
        queued.reject(abortError(task.label));
      };
      task.signal?.addEventListener('abort', onAbort, { once: true });

      this.queue.push(queued);
      this.dispatch();
    });
  }

  private dispatch(): void {
    if (this.running || this.queue.length === 0) return;

    let bestIndex = 0;
    for (let i = 1; i < this.queue.length; i += 1) {
      const candidate = this.queue[i];
      const best = this.queue[bestIndex];
      const byPriority = PRIORITY_RANK[candidate.priority] - PRIORITY_RANK[best.priority];
      if (byPriority < 0 || (byPriority === 0 && candidate.sequence < best.sequence)) {
        bestIndex = i;
      }
    }

    const [next] = this.queue.splice(bestIndex, 1);
    this.running = true;
    next.start();
  }
}

function abortError(label: string): Error {
  const error = new Error(`INFERENCE_ABORTED:${label}`);
  error.name = 'AbortError';
  return error;
}
