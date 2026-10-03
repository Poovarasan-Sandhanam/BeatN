import { ModelResidencyManager } from '../ModelResidencyManager';
import type { LoadableEngine, ModelKind } from '../engines/types';

const MB = 1024 * 1024;

class FakeEngine implements LoadableEngine {
  readonly kind: ModelKind = 'generation';
  isLoaded = false;
  loads = 0;
  unloads = 0;

  constructor(readonly id: string) {}

  async loadModel(): Promise<void> {
    this.loads += 1;
    this.isLoaded = true;
  }

  async unloadModel(): Promise<void> {
    this.unloads += 1;
    this.isLoaded = false;
  }
}

const entryFor = (engine: FakeEngine, bytes: number) => ({
  engine,
  modelPath: `/models/${engine.id}`,
  estimatedBytes: bytes,
});

describe('ModelResidencyManager', () => {
  let clock: number;
  const now = () => (clock += 1);

  beforeEach(() => {
    clock = 0;
  });

  it('loads a model on first acquire', async () => {
    const manager = new ModelResidencyManager({ budgetBytes: 1000 * MB, now });
    const engine = new FakeEngine('llm');

    await manager.acquire(entryFor(engine, 400 * MB));

    expect(engine.isLoaded).toBe(true);
    expect(engine.loads).toBe(1);
    expect(manager.residentBytes).toBe(400 * MB);
  });

  it('does not reload an already-resident model', async () => {
    const manager = new ModelResidencyManager({ budgetBytes: 1000 * MB, now });
    const engine = new FakeEngine('llm');

    await manager.acquire(entryFor(engine, 400 * MB));
    manager.release('llm');
    await manager.acquire(entryFor(engine, 400 * MB));

    expect(engine.loads).toBe(1);
  });

  it('evicts the least recently used model to stay within budget', async () => {
    const evicted: string[] = [];
    const manager = new ModelResidencyManager({
      budgetBytes: 800 * MB,
      now,
      onEvict: (id) => evicted.push(id),
    });

    const whisper = new FakeEngine('whisper');
    const embed = new FakeEngine('embed');
    const llm = new FakeEngine('llm');

    await manager.acquire(entryFor(whisper, 300 * MB));
    manager.release('whisper');
    await manager.acquire(entryFor(embed, 200 * MB));
    manager.release('embed');

    // 300 + 200 = 500 resident; the 500 MB LLM needs whisper out of the way.
    await manager.acquire(entryFor(llm, 500 * MB));

    expect(evicted).toEqual(['whisper']);
    expect(whisper.isLoaded).toBe(false);
    expect(embed.isLoaded).toBe(true);
    expect(llm.isLoaded).toBe(true);
    expect(manager.residentBytes).toBeLessThanOrEqual(800 * MB);
  });

  it('refuses to evict a pinned model', async () => {
    const manager = new ModelResidencyManager({ budgetBytes: 600 * MB, now });
    const whisper = new FakeEngine('whisper');

    await manager.acquire(entryFor(whisper, 300 * MB)); // acquired => pinned

    await expect(manager.evict('whisper')).rejects.toThrow('CANNOT_EVICT_PINNED_MODEL:whisper');
  });

  it('throws rather than silently overcommitting when everything is pinned', async () => {
    const manager = new ModelResidencyManager({ budgetBytes: 600 * MB, now });
    const whisper = new FakeEngine('whisper');
    const llm = new FakeEngine('llm');

    await manager.acquire(entryFor(whisper, 400 * MB)); // pinned, not released

    await expect(manager.acquire(entryFor(llm, 400 * MB))).rejects.toThrow(
      'CANNOT_FREE_RAM_ALL_MODELS_PINNED',
    );
    expect(llm.isLoaded).toBe(false);
  });

  it('rejects a model larger than the entire budget', async () => {
    const manager = new ModelResidencyManager({ budgetBytes: 500 * MB, now });
    const huge = new FakeEngine('huge');

    await expect(manager.acquire(entryFor(huge, 900 * MB))).rejects.toThrow(
      'MODEL_EXCEEDS_RAM_BUDGET:huge',
    );
    expect(huge.isLoaded).toBe(false);
  });

  it('evicts everything unpinned on memory pressure', async () => {
    const manager = new ModelResidencyManager({ budgetBytes: 2000 * MB, now });
    const whisper = new FakeEngine('whisper');
    const llm = new FakeEngine('llm');

    await manager.acquire(entryFor(whisper, 300 * MB));
    manager.release('whisper');
    await manager.acquire(entryFor(llm, 500 * MB));
    manager.release('llm');

    await manager.evictAll('pressure');

    expect(manager.residentBytes).toBe(0);
    expect(whisper.unloads).toBe(1);
    expect(llm.unloads).toBe(1);
  });

  it('keeps a pinned model through an evictAll', async () => {
    const manager = new ModelResidencyManager({ budgetBytes: 2000 * MB, now });
    const whisper = new FakeEngine('whisper');
    const llm = new FakeEngine('llm');

    await manager.acquire(entryFor(whisper, 300 * MB));
    manager.release('whisper');
    await manager.acquire(entryFor(llm, 500 * MB)); // still pinned

    await manager.evictAll('pressure');

    expect(whisper.isLoaded).toBe(false);
    expect(llm.isLoaded).toBe(true);
    expect(manager.residentIds).toEqual(['llm']);
  });

  it('treats release as a use, so the just-used model is not the next victim', async () => {
    const evicted: string[] = [];
    const manager = new ModelResidencyManager({
      budgetBytes: 800 * MB,
      now,
      onEvict: (id) => evicted.push(id),
    });

    const a = new FakeEngine('a');
    const b = new FakeEngine('b');
    const c = new FakeEngine('c');

    await manager.acquire(entryFor(a, 300 * MB));
    manager.release('a');
    await manager.acquire(entryFor(b, 300 * MB));
    manager.release('b');
    // Touch `a` again — `b` is now the least recently used.
    await manager.acquire(entryFor(a, 300 * MB));
    manager.release('a');

    await manager.acquire(entryFor(c, 300 * MB));

    expect(evicted).toEqual(['b']);
  });
});
