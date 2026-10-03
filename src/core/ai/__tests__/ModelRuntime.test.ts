import { InferenceArbiter } from '../InferenceArbiter';
import { ModelResidencyManager } from '../ModelResidencyManager';
import { ModelRuntime, type ModelRef } from '../ModelRuntime';

const MB = 1024 * 1024;

const sttA: ModelRef = { modelId: 'whisper-base', path: '/m/base.bin', approxBytes: 60 * MB };
const sttB: ModelRef = { modelId: 'whisper-tiny', path: '/m/tiny.bin', approxBytes: 32 * MB };
const llmA: ModelRef = { modelId: 'qwen-1.5b', path: '/m/qwen.gguf', approxBytes: 1120 * MB };

/** Replaces the real engines' native calls while keeping their identity. */
function stubRuntime(options?: { budgetBytes?: number }) {
  const runtime = new ModelRuntime({
    budgetBytes: options?.budgetBytes ?? 1_800_000_000,
    arbiter: new InferenceArbiter(),
  });

  const calls = { sttLoads: 0, sttUnloads: 0, llmLoads: 0, llmUnloads: 0 };
  let sttLoaded = false;
  let llmLoaded = false;

  jest.spyOn(runtime.stt, 'loadModel').mockImplementation(async () => {
    calls.sttLoads += 1;
    sttLoaded = true;
  });
  jest.spyOn(runtime.stt, 'unloadModel').mockImplementation(async () => {
    calls.sttUnloads += 1;
    sttLoaded = false;
  });
  jest.spyOn(runtime.stt, 'isLoaded', 'get').mockImplementation(() => sttLoaded);

  jest.spyOn(runtime.llm, 'loadModel').mockImplementation(async () => {
    calls.llmLoads += 1;
    llmLoaded = true;
  });
  jest.spyOn(runtime.llm, 'unloadModel').mockImplementation(async () => {
    calls.llmUnloads += 1;
    llmLoaded = false;
  });
  jest.spyOn(runtime.llm, 'isLoaded', 'get').mockImplementation(() => llmLoaded);

  return { runtime, calls };
}

describe('ModelRuntime', () => {
  it('loads a model on first use and returns the work result', async () => {
    const { runtime, calls } = stubRuntime();

    const result = await runtime.useStt(sttA, async () => 'transcript');

    expect(result).toBe('transcript');
    expect(calls.sttLoads).toBe(1);
    expect(runtime.residentModelIds).toContain('whisper-base');
  });

  it('keeps the model loaded across runs so the cost is paid once', async () => {
    const { runtime, calls } = stubRuntime();

    await runtime.useStt(sttA, async () => 1);
    await runtime.useStt(sttA, async () => 2);
    await runtime.useStt(sttA, async () => 3);

    expect(calls.sttLoads).toBe(1);
  });

  it('unloads the old weights before loading a different model on the same engine', async () => {
    const { runtime, calls } = stubRuntime();

    await runtime.useStt(sttA, async () => 1);
    await runtime.useStt(sttB, async () => 2);

    expect(calls.sttUnloads).toBe(1);
    expect(calls.sttLoads).toBe(2);
    expect(runtime.residentModelIds).toEqual(['whisper-tiny']);
  });

  it('lets speech and language models co-reside', async () => {
    const { runtime, calls } = stubRuntime();

    await runtime.useStt(sttA, async () => 1);
    await runtime.useLlm(llmA, async () => 2);

    expect(calls.sttUnloads).toBe(0);
    expect(runtime.residentModelIds).toHaveLength(2);
  });

  // The bug this class exists to fix.
  it('releases every model when the app backgrounds', async () => {
    const { runtime, calls } = stubRuntime();

    await runtime.useStt(sttA, async () => 1);
    await runtime.useLlm(llmA, async () => 2);
    await runtime.releaseAll('pressure');

    expect(calls.sttUnloads).toBe(1);
    expect(calls.llmUnloads).toBe(1);
    expect(runtime.residentModelIds).toEqual([]);
  });

  it('reloads after a release rather than assuming it is still resident', async () => {
    const { runtime, calls } = stubRuntime();

    await runtime.useStt(sttA, async () => 1);
    await runtime.releaseAll();
    await runtime.useStt(sttA, async () => 2);

    expect(calls.sttLoads).toBe(2);
  });

  it('unpins the model when the work throws, so it can still be evicted', async () => {
    const { runtime, calls } = stubRuntime();

    await expect(
      runtime.useStt(sttA, async () => {
        throw new Error('TRANSCRIBE_FAILED');
      }),
    ).rejects.toThrow('TRANSCRIBE_FAILED');

    await runtime.releaseAll();
    expect(calls.sttUnloads).toBe(1);
  });

  it('serialises concurrent work rather than running it in parallel', async () => {
    const { runtime } = stubRuntime();
    let active = 0;
    let peak = 0;

    const work = async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
    };

    await Promise.all([
      runtime.useStt(sttA, work),
      runtime.useLlm(llmA, work),
      runtime.useStt(sttA, work),
    ]);

    expect(peak).toBe(1);
  });

  it('evicts under budget pressure instead of overcommitting', async () => {
    // 60 MB + 1120 MB = 1180 MB, so a 1150 MB budget holds the language model
    // but not both at once.
    const { runtime, calls } = stubRuntime({ budgetBytes: 1150 * MB });

    await runtime.useStt(sttA, async () => 1);
    await runtime.useLlm(llmA, async () => 2);

    expect(calls.sttUnloads).toBe(1);
    expect(runtime.residentModelIds).toEqual(['qwen-1.5b']);
  });

  it('reports busy only while work is in flight', async () => {
    const { runtime } = stubRuntime();
    expect(runtime.isBusy).toBe(false);

    const inFlight = runtime.useStt(sttA, async () => {
      expect(runtime.isBusy).toBe(true);
      return 1;
    });

    await inFlight;
    expect(runtime.isBusy).toBe(false);
  });

  it('does not leave a stale entry after releaseAll with a custom residency', async () => {
    const residency = new ModelResidencyManager({ budgetBytes: 1_800_000_000 });
    const runtime = new ModelRuntime({ residency, arbiter: new InferenceArbiter() });
    jest.spyOn(runtime.stt, 'loadModel').mockResolvedValue(undefined);
    jest.spyOn(runtime.stt, 'unloadModel').mockResolvedValue(undefined);

    await runtime.useStt(sttA, async () => 1);
    await runtime.releaseAll();

    expect(residency.residentIds).toEqual([]);
    expect(runtime.residentModelIds).toEqual([]);
  });
});
