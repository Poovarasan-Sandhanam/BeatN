import { InferenceArbiter } from '../InferenceArbiter';

/** A promise the test can hold open to keep the arbiter occupied. */
const gate = () => {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = () => resolve();
  });
  return { promise, open };
};

/** Yield to the macrotask queue so the arbiter can dispatch. */
const tick = () =>
  new Promise<void>((resolve) => {
    setImmediate(() => resolve());
  });

describe('InferenceArbiter', () => {
  it('runs a single task and returns its value', async () => {
    const arbiter = new InferenceArbiter();
    await expect(
      arbiter.run({ label: 'a', priority: 'foreground', run: async () => 42 }),
    ).resolves.toBe(42);
    expect(arbiter.isBusy).toBe(false);
  });

  it('never runs two tasks at once', async () => {
    const arbiter = new InferenceArbiter();
    let concurrent = 0;
    let peak = 0;

    const task = async () => {
      concurrent += 1;
      peak = Math.max(peak, concurrent);
      await tick();
      concurrent -= 1;
    };

    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        arbiter.run({ label: `t${i}`, priority: 'background', run: task }),
      ),
    );

    expect(peak).toBe(1);
  });

  it('serves higher priority first while one is in flight', async () => {
    const arbiter = new InferenceArbiter();
    const order: string[] = [];
    const blocker = gate();

    const first = arbiter.run({
      label: 'blocker',
      priority: 'background',
      run: async () => {
        order.push('blocker');
        await blocker.promise;
      },
    });

    await tick(); // let the blocker occupy the engine

    const queued = [
      arbiter.run({
        label: 'bg',
        priority: 'background',
        run: async () => void order.push('bg'),
      }),
      arbiter.run({
        label: 'interactive',
        priority: 'interactive',
        run: async () => void order.push('interactive'),
      }),
      arbiter.run({
        label: 'fg',
        priority: 'foreground',
        run: async () => void order.push('fg'),
      }),
    ];

    blocker.open();
    await Promise.all([first, ...queued]);

    expect(order).toEqual(['blocker', 'interactive', 'fg', 'bg']);
  });

  it('keeps equal priorities in FIFO order', async () => {
    const arbiter = new InferenceArbiter();
    const order: string[] = [];
    const blocker = gate();

    const first = arbiter.run({
      label: 'blocker',
      priority: 'foreground',
      run: async () => {
        await blocker.promise;
      },
    });
    await tick();

    const queued = ['a', 'b', 'c'].map((label) =>
      arbiter.run({
        label,
        priority: 'background',
        run: async () => void order.push(label),
      }),
    );

    blocker.open();
    await Promise.all([first, ...queued]);
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('releases the engine when a task throws', async () => {
    const arbiter = new InferenceArbiter();
    await expect(
      arbiter.run({
        label: 'boom',
        priority: 'foreground',
        run: async () => {
          throw new Error('BOOM');
        },
      }),
    ).rejects.toThrow('BOOM');

    expect(arbiter.isBusy).toBe(false);
    await expect(
      arbiter.run({ label: 'after', priority: 'foreground', run: async () => 'ok' }),
    ).resolves.toBe('ok');
  });

  it('rejects an already-aborted task without occupying the engine', async () => {
    const arbiter = new InferenceArbiter();
    const controller = new AbortController();
    controller.abort();

    const run = jest.fn();
    await expect(
      arbiter.run({ label: 'dead', priority: 'foreground', run, signal: controller.signal }),
    ).rejects.toThrow(/INFERENCE_ABORTED/);

    expect(run).not.toHaveBeenCalled();
    expect(arbiter.isBusy).toBe(false);
  });

  it('drops a queued task that is aborted before it starts', async () => {
    const arbiter = new InferenceArbiter();
    const blocker = gate();
    const controller = new AbortController();
    const neverRuns = jest.fn();

    const first = arbiter.run({
      label: 'blocker',
      priority: 'foreground',
      run: async () => {
        await blocker.promise;
      },
    });
    await tick();

    const cancelled = arbiter.run({
      label: 'cancelled',
      priority: 'foreground',
      run: neverRuns,
      signal: controller.signal,
    });

    expect(arbiter.queueDepth).toBe(1);
    controller.abort();
    await expect(cancelled).rejects.toThrow(/INFERENCE_ABORTED/);
    expect(arbiter.queueDepth).toBe(0);

    blocker.open();
    await first;
    expect(neverRuns).not.toHaveBeenCalled();
  });

  it('hands the running task a signal it can observe', async () => {
    const arbiter = new InferenceArbiter();
    const controller = new AbortController();
    let observed = false;

    const promise = arbiter.run({
      label: 'cancellable',
      priority: 'foreground',
      signal: controller.signal,
      run: (signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            observed = true;
            reject(new Error('CANCELLED'));
          });
        }),
    });

    await tick();
    controller.abort();
    await expect(promise).rejects.toThrow('CANCELLED');
    expect(observed).toBe(true);
    expect(arbiter.isBusy).toBe(false);
  });
});
