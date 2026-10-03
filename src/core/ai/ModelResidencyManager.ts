/**
 * Decides which models are allowed to be in RAM right now.
 *
 * On a phone you cannot hold Whisper, a 1.5B generation model and an embedding
 * model resident at once — the OS will kill the app. Residency is therefore a
 * managed resource with a budget, not something each caller decides for itself.
 *
 * Policy:
 *   - never exceed the RAM budget derived from the device profile
 *   - evict least-recently-used first
 *   - never evict a pinned engine (the one the current inference is using)
 *   - evict everything on background / memory pressure
 *
 * This class does not run inference and does not know about queuing. It only
 * answers "is this model loaded, and what did I have to unload to get there".
 * Serialization is InferenceArbiter's job.
 */

import type { LoadableEngine } from './engines/types';

export interface ResidencyEntry {
  engine: LoadableEngine;
  modelPath: string;
  /** Expected resident size, used for admission before the engine reports it. */
  estimatedBytes: number;
}

export interface ResidencyOptions {
  /** Hard ceiling on total resident model bytes. */
  budgetBytes: number;
  now?: () => number;
  onEvict?: (engineId: string, reason: 'budget' | 'manual' | 'pressure') => void;
}

interface Resident {
  entry: ResidencyEntry;
  lastUsedAt: number;
  pinned: boolean;
}

export class ModelResidencyManager {
  private readonly residents = new Map<string, Resident>();
  private readonly now: () => number;

  constructor(private readonly options: ResidencyOptions) {
    this.now = options.now ?? Date.now;
  }

  get budgetBytes(): number {
    return this.options.budgetBytes;
  }

  /** Sum of estimated bytes currently held. */
  get residentBytes(): number {
    let total = 0;
    for (const resident of this.residents.values()) total += resident.entry.estimatedBytes;
    return total;
  }

  get residentIds(): string[] {
    return [...this.residents.keys()];
  }

  isResident(engineId: string): boolean {
    return this.residents.has(engineId);
  }

  /**
   * Guarantee `entry.engine` is loaded, evicting others if necessary, and mark
   * it as the most recently used. The returned engine is pinned until
   * `release()` is called, so a concurrent `ensureResident` cannot evict the
   * model an in-flight inference is using.
   */
  async acquire<E extends LoadableEngine>(entry: ResidencyEntry & { engine: E }): Promise<E> {
    const existing = this.residents.get(entry.engine.id);
    if (existing) {
      existing.lastUsedAt = this.now();
      existing.pinned = true;
      return existing.entry.engine as E;
    }

    if (entry.estimatedBytes > this.options.budgetBytes) {
      throw new Error(`MODEL_EXCEEDS_RAM_BUDGET:${entry.engine.id}`);
    }

    await this.evictUntilRoomFor(entry.estimatedBytes);

    await entry.engine.loadModel(entry.modelPath);
    this.residents.set(entry.engine.id, {
      entry,
      lastUsedAt: this.now(),
      pinned: true,
    });
    return entry.engine;
  }

  /** Unpin an engine so it becomes eligible for eviction again. */
  release(engineId: string): void {
    const resident = this.residents.get(engineId);
    if (!resident) return;
    resident.pinned = false;
    resident.lastUsedAt = this.now();
  }

  async evict(engineId: string, reason: 'budget' | 'manual' | 'pressure' = 'manual'): Promise<void> {
    const resident = this.residents.get(engineId);
    if (!resident) return;
    if (resident.pinned) throw new Error(`CANNOT_EVICT_PINNED_MODEL:${engineId}`);

    this.residents.delete(engineId);
    await resident.entry.engine.unloadModel();
    this.options.onEvict?.(engineId, reason);
  }

  /**
   * Drop everything evictable. Called on AppState background and on a
   * memory-pressure warning — holding a 1.1 GB model while backgrounded is the
   * fastest way to be killed.
   */
  async evictAll(reason: 'manual' | 'pressure' = 'pressure'): Promise<void> {
    for (const id of [...this.residents.keys()]) {
      const resident = this.residents.get(id);
      if (!resident || resident.pinned) continue;
      await this.evict(id, reason);
    }
  }

  private async evictUntilRoomFor(bytes: number): Promise<void> {
    while (this.residentBytes + bytes > this.options.budgetBytes) {
      const victim = this.leastRecentlyUsedEvictable();
      if (!victim) {
        throw new Error('CANNOT_FREE_RAM_ALL_MODELS_PINNED');
      }
      await this.evict(victim, 'budget');
    }
  }

  private leastRecentlyUsedEvictable(): string | null {
    let oldestId: string | null = null;
    let oldestAt = Infinity;
    for (const [id, resident] of this.residents) {
      if (resident.pinned) continue;
      if (resident.lastUsedAt < oldestAt) {
        oldestAt = resident.lastUsedAt;
        oldestId = id;
      }
    }
    return oldestId;
  }
}
