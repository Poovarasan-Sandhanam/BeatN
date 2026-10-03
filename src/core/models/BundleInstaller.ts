/**
 * Installs a whole bundle as one user-visible operation.
 *
 * Composes `ModelManager` rather than extending or modifying it: the manager
 * still owns one model's bytes on disk, and this owns "the user asked for
 * BeatN to work offline".
 *
 * Progress is weighted by model size, so a 60 MB speech model does not appear
 * to be half the work when it is 5% of it. Models already on disk count as
 * complete, so an interrupted install resumes visibly rather than restarting
 * from zero.
 */

import { getModelSpec } from './catalog';
import type { DownloadProgressInfo, InstalledModel } from './ModelManager';
import { modelManager } from './ModelManager';
import { bundleModelIds, type ModelBundle } from './bundles';

/** The slice of ModelManager this needs. Narrow, so tests can stand it in. */
export interface ModelStore {
  isInstalled(modelId: string): boolean;
  download(
    modelId: string,
    onProgress?: (info: DownloadProgressInfo) => void,
  ): Promise<InstalledModel>;
  cancelDownload(modelId: string): void;
}

export interface BundleProgress {
  /** 0..1 across the whole bundle. */
  overall: number;
  bytesWritten: number;
  totalBytes: number;
  /** Null once every model is installed. */
  currentModelId: string | null;
  completedCount: number;
  totalCount: number;
}

export class BundleInstaller {
  private activeModelId: string | null = null;
  private cancelled = false;

  constructor(private readonly store: ModelStore = modelManager) {}

  isInstalled(bundle: ModelBundle): boolean {
    return bundleModelIds(bundle).every((id) => this.store.isInstalled(id));
  }

  missingModelIds(bundle: ModelBundle): string[] {
    return bundleModelIds(bundle).filter((id) => !this.store.isInstalled(id));
  }

  /** Bytes still to fetch — what the download button should quote. */
  remainingBytes(bundle: ModelBundle): number {
    return this.missingModelIds(bundle).reduce(
      (total, id) => total + getModelSpec(id).approxBytes,
      0,
    );
  }

  async install(
    bundle: ModelBundle,
    onProgress?: (progress: BundleProgress) => void,
  ): Promise<void> {
    this.cancelled = false;

    const ids = bundleModelIds(bundle);
    const specs = ids.map(getModelSpec);
    const totalBytes = specs.reduce((total, spec) => total + spec.approxBytes, 0);
    const totalCount = specs.length;

    let settledBytes = 0;
    let completedCount = 0;
    for (const spec of specs) {
      if (this.store.isInstalled(spec.id)) {
        settledBytes += spec.approxBytes;
        completedCount += 1;
      }
    }

    const emit = (currentModelId: string | null, inFlightBytes: number) => {
      const bytesWritten = Math.min(settledBytes + inFlightBytes, totalBytes);
      onProgress?.({
        overall: totalBytes > 0 ? Math.min(1, bytesWritten / totalBytes) : 1,
        bytesWritten,
        totalBytes,
        currentModelId,
        completedCount,
        totalCount,
      });
    };

    for (const spec of specs) {
      if (this.store.isInstalled(spec.id)) continue;
      if (this.cancelled) throw new Error('BUNDLE_INSTALL_CANCELLED');

      this.activeModelId = spec.id;
      emit(spec.id, 0);

      try {
        await this.store.download(spec.id, ({ bytesWritten }) => {
          // Clamp: a server may report more than our approximate size.
          emit(spec.id, Math.min(bytesWritten, spec.approxBytes));
        });
      } finally {
        this.activeModelId = null;
      }

      settledBytes += spec.approxBytes;
      completedCount += 1;
      emit(null, 0);
    }

    emit(null, 0);
  }

  /** Cancels the download in flight and stops before the next one starts. */
  cancel(): void {
    this.cancelled = true;
    if (this.activeModelId) this.store.cancelDownload(this.activeModelId);
  }
}

export const bundleInstaller = new BundleInstaller();
