import { ProcessingQueue } from '../ProcessingQueue';
import type { JobStore, JobType, ProcessingJob } from '../types';

const job = (overrides: Partial<ProcessingJob> = {}): ProcessingJob => ({
  id: 'job-1',
  entryId: 'entry-1',
  type: 'transcribe',
  status: 'running',
  priority: 0,
  attempts: 0,
  maxAttempts: 3,
  lastError: null,
  createdAt: 0,
  updatedAt: 0,
  notBefore: 0,
  startedAt: 0,
  completedAt: null,
  heartbeatAt: 0,
  ...overrides,
});

/** Hands out a fixed list of jobs, then nothing. */
class FakeStore implements JobStore {
  completed: string[] = [];
  failed: { id: string; error: string }[] = [];
  heartbeats: string[] = [];
  recovered = 0;
  recoverCalls = 0;
  claimError: Error | null = null;

  constructor(private queued: ProcessingJob[] = []) {}

  async claimNext(): Promise<ProcessingJob | null> {
    if (this.claimError) {
      const error = this.claimError;
      this.claimError = null;
      throw error;
    }
    return this.queued.shift() ?? null;
  }

  async heartbeat(jobId: string): Promise<void> {
    this.heartbeats.push(jobId);
  }

  async complete(jobId: string): Promise<void> {
    this.completed.push(jobId);
  }

  async fail(jobId: string, error: string): Promise<void> {
    this.failed.push({ id: jobId, error });
  }

  async recoverStale(): Promise<number> {
    this.recoverCalls += 1;
    return this.recovered;
  }
}

/** Runs the worker until it has settled `count` jobs, then stops it. */
async function drain(queue: ProcessingQueue, store: FakeStore, count: number) {
  await queue.start();
  const deadline = Date.now() + 2000;
  while (store.completed.length + store.failed.length < count && Date.now() < deadline) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  await queue.stop();
}

/** Resolves on the next macrotask — fast, but still lets the test loop run. */
const instantSleep = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('ProcessingQueue', () => {
  it('recovers abandoned jobs before taking new work', async () => {
    const store = new FakeStore();
    store.recovered = 2;
    const queue = new ProcessingQueue(store, { sleep: instantSleep });

    await queue.start();
    await queue.stop();

    expect(store.recoverCalls).toBe(1);
  });

  it('runs a handler and marks the job completed', async () => {
    const store = new FakeStore([job()]);
    const queue = new ProcessingQueue(store, { sleep: instantSleep });
    const handler = jest.fn().mockResolvedValue(undefined);
    queue.register('transcribe', handler);

    await drain(queue, store, 1);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(store.completed).toEqual(['job-1']);
    expect(store.failed).toEqual([]);
  });

  it('records a handler failure instead of throwing at the caller', async () => {
    const store = new FakeStore([job()]);
    const queue = new ProcessingQueue(store, { sleep: instantSleep });
    queue.register('transcribe', async () => {
      throw new Error('WHISPER_MODEL_NOT_LOADED');
    });

    await drain(queue, store, 1);

    expect(store.failed).toEqual([{ id: 'job-1', error: 'WHISPER_MODEL_NOT_LOADED' }]);
    expect(store.completed).toEqual([]);
  });

  it('fails a job whose type has no handler rather than spinning on it', async () => {
    const store = new FakeStore([job({ type: 'analyse' as JobType })]);
    const queue = new ProcessingQueue(store, { sleep: instantSleep });

    await drain(queue, store, 1);

    expect(store.failed[0].error).toBe('NO_HANDLER_FOR_JOB_TYPE:analyse');
  });

  it('processes several jobs in order, one at a time', async () => {
    const store = new FakeStore([job({ id: 'a' }), job({ id: 'b' }), job({ id: 'c' })]);
    const queue = new ProcessingQueue(store, { sleep: instantSleep });

    let active = 0;
    let peak = 0;
    queue.register('transcribe', async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
    });

    await drain(queue, store, 3);

    expect(store.completed).toEqual(['a', 'b', 'c']);
    expect(peak).toBe(1);
  });

  it('survives a claim failure and keeps working', async () => {
    const store = new FakeStore([job()]);
    store.claimError = new Error('DATABASE_LOCKED');
    const queue = new ProcessingQueue(store, { sleep: instantSleep });
    queue.register('transcribe', async () => {});

    await drain(queue, store, 1);

    expect(store.completed).toEqual(['job-1']);
  });

  it('notifies on each settled job so the UI can refresh', async () => {
    const store = new FakeStore([job({ id: 'ok' }), job({ id: 'bad' })]);
    const settled: string[] = [];
    const queue = new ProcessingQueue(store, {
      sleep: instantSleep,
      onJobSettled: (j, outcome) => settled.push(`${j.id}:${outcome}`),
    });
    queue.register('transcribe', async (j) => {
      if (j.id === 'bad') throw new Error('BOOM');
    });

    await drain(queue, store, 2);

    expect(settled).toEqual(['ok:completed', 'bad:failed']);
  });

  it('is idempotent on start and reports running state', async () => {
    const store = new FakeStore();
    const queue = new ProcessingQueue(store, { sleep: instantSleep });

    expect(queue.isRunning).toBe(false);
    await queue.start();
    await queue.start();
    expect(queue.isRunning).toBe(true);
    expect(store.recoverCalls).toBe(1);

    await queue.stop();
    expect(queue.isRunning).toBe(false);
  });

  it('stops cleanly with nothing queued', async () => {
    const store = new FakeStore();
    const queue = new ProcessingQueue(store, { sleep: instantSleep });
    await queue.start();
    await expect(queue.stop()).resolves.toBeUndefined();
  });
});
