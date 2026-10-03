/**
 * Owns the lifetime of every loaded model.
 *
 * Fixes the failure this replaces: engines used to be held in component refs,
 * loaded on first use and never unloaded. ~1.2 GB of weights stayed resident
 * when the app backgrounded, which is the textbook way to get killed by iOS.
 *
 * Two rules are enforced here rather than left to callers:
 *   1. Nothing calls an engine directly — every use goes through the arbiter,
 *      so a background embedding job cannot run while the user waits on Ask.
 *   2. Nothing stays loaded across a backgrounding — `releaseAll()` evicts.
 *
 * `use*` hands the engine to a callback instead of returning it, so the model
 * is guaranteed pinned for the duration of the work and unpinned afterwards
 * even if the work throws.
 */

import { LlamaEngine } from '../llm/LlamaEngine';
import { WhisperEngine } from '../stt/WhisperEngine';
import { InferenceArbiter, type InferencePriority } from './InferenceArbiter';
import { ModelResidencyManager } from './ModelResidencyManager';

export interface ModelRuntimeOptions {
  /**
   * Ceiling on resident model bytes.
   *
   * PROVISIONAL. This should be derived from the device's physical RAM, which
   * needs `expo-device`. Until then it is a fixed figure chosen to let one
   * speech model and one language model co-reside — reloading a 1.1 GB model
   * between transcription and analysis would cost more than it saves — while
   * still refusing a combination that is obviously too large.
   */
  budgetBytes?: number;
  arbiter?: InferenceArbiter;
  residency?: ModelResidencyManager;
}

const DEFAULT_BUDGET_BYTES = 1_800_000_000;

export interface ModelRef {
  /** Catalogue id, used for residency bookkeeping. */
  modelId: string;
  path: string;
  /** Expected resident size, from the model catalogue. */
  approxBytes: number;
}

export class ModelRuntime {
  readonly stt = new WhisperEngine();
  readonly llm = new LlamaEngine({ contextSize: 2048 });

  private readonly arbiter: InferenceArbiter;
  private readonly residency: ModelResidencyManager;
  /** Which catalogue model each engine currently holds. */
  private loaded = new Map<string, string>();

  constructor(options: ModelRuntimeOptions = {}) {
    this.arbiter = options.arbiter ?? new InferenceArbiter();
    this.residency =
      options.residency ??
      new ModelResidencyManager({ budgetBytes: options.budgetBytes ?? DEFAULT_BUDGET_BYTES });
  }

  get isBusy(): boolean {
    return this.arbiter.isBusy;
  }

  /**
   * Derived from the residency manager rather than trusted from `loaded`.
   * The manager can evict an engine under budget pressure without telling us,
   * so an unfiltered map would report models that are no longer in memory.
   */
  get residentModelIds(): string[] {
    return [...this.loaded.entries()]
      .filter(([engineId]) => this.residency.isResident(engineId))
      .map(([, modelId]) => modelId);
  }

  useStt<T>(
    model: ModelRef,
    work: (engine: WhisperEngine) => Promise<T>,
    priority: InferencePriority = 'foreground',
  ): Promise<T> {
    return this.use(this.stt, model, work, priority, 'stt');
  }

  useLlm<T>(
    model: ModelRef,
    work: (engine: LlamaEngine) => Promise<T>,
    priority: InferencePriority = 'foreground',
  ): Promise<T> {
    return this.use(this.llm, model, work, priority, 'llm');
  }

  private async use<E extends WhisperEngine | LlamaEngine, T>(
    engine: E,
    model: ModelRef,
    work: (engine: E) => Promise<T>,
    priority: InferencePriority,
    label: string,
  ): Promise<T> {
    return this.arbiter.run({
      label: `${label}:${model.modelId}`,
      priority,
      run: async () => {
        // Switching model on an engine means the old weights must go first,
        // or both sets are briefly resident and the budget is a fiction.
        const current = this.loaded.get(engine.id);
        if (current && current !== model.modelId) {
          // It may already have been evicted under budget pressure.
          if (this.residency.isResident(engine.id)) {
            await this.residency.evict(engine.id, 'manual');
          }
          this.loaded.delete(engine.id);
        }

        await this.residency.acquire({
          engine,
          modelPath: model.path,
          estimatedBytes: model.approxBytes,
        });
        this.loaded.set(engine.id, model.modelId);

        try {
          return await work(engine);
        } finally {
          this.residency.release(engine.id);
        }
      },
    });
  }

  /**
   * Drop every model that is not pinned by in-flight work.
   *
   * Called when the app backgrounds and on a memory-pressure warning. Holding
   * a gigabyte of weights while backgrounded is what gets the process killed.
   */
  async releaseAll(reason: 'manual' | 'pressure' = 'pressure'): Promise<void> {
    await this.residency.evictAll(reason);
    for (const engineId of [...this.loaded.keys()]) {
      if (!this.residency.isResident(engineId)) this.loaded.delete(engineId);
    }
  }
}

/** One runtime per app. Models are a process-wide resource, not a screen's. */
export const modelRuntime = new ModelRuntime();
