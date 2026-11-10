import { Directory, File, Paths } from 'expo-file-system';

import { getModelSpec, type ModelSpec } from './catalog';

export interface DownloadProgressInfo {
  bytesWritten: number;
  totalBytes: number;
  percent: number;
}

export interface InstalledModel {
  spec: ModelSpec;
  path: string;
  sizeBytes: number;
}

const MODELS_DIRNAME = 'models';

/**
 * Owns model files on disk: where they live, whether they are present and
 * complete, and how they get there. Engines are handed a path and nothing else.
 */
export class ModelManager {
  private readonly tasks = new Map<string, { cancel: () => void }>();

  get directory(): Directory {
    const directory = new Directory(Paths.document, MODELS_DIRNAME);
    if (!directory.exists) directory.create({ intermediates: true });
    return directory;
  }

  fileFor(modelId: string): File {
    const spec = getModelSpec(modelId);
    const extension = spec.kind === 'llm' ? 'gguf' : 'bin';
    return new File(this.directory, `${spec.id}.${extension}`);
  }

  isInstalled(modelId: string): boolean {
    const file = this.fileFor(modelId);
    if (!file.exists) return false;

    // Exact size, not "close enough": a download killed mid-flight leaves a
    // short file, and loading a truncated model fails in confusing ways.
    // Contents are checked once, after download — see `verify`.
    return file.size === getModelSpec(modelId).bytes;
  }

  /**
   * Hashes the file and compares it with the catalog. Native MD5 over 64 KB
   * chunks: seconds even for the 1.1 GB model, but synchronous, so callers
   * should let the UI paint a "checking" state first.
   */
  verify(modelId: string): boolean {
    const file = this.fileFor(modelId);
    if (!file.exists) return false;
    return file.info({ md5: true }).md5 === getModelSpec(modelId).md5;
  }

  installed(modelId: string): InstalledModel | null {
    if (!this.isInstalled(modelId)) return null;
    const file = this.fileFor(modelId);
    return { spec: getModelSpec(modelId), path: file.uri, sizeBytes: file.size };
  }

  hasRoomFor(modelId: string): boolean {
    const spec = getModelSpec(modelId);
    // Leave headroom so the download does not fill the device completely.
    return Paths.availableDiskSpace > spec.approxBytes * 1.2;
  }

  async download(
    modelId: string,
    onProgress?: (info: DownloadProgressInfo) => void,
    onVerifying?: () => void,
  ): Promise<InstalledModel> {
    const spec = getModelSpec(modelId);

    if (this.isInstalled(modelId)) {
      return this.installed(modelId)!;
    }
    if (!this.hasRoomFor(modelId)) {
      throw new Error('MODEL_DOWNLOAD_INSUFFICIENT_STORAGE');
    }

    const destination = this.fileFor(modelId);
    // Clear any partial file so the task starts clean.
    if (destination.exists) destination.delete();

    const task = File.createDownloadTask(spec.url, destination, {});
    const subscription = task.addListener('progress', (progress) => {
      // totalBytes is -1 when the server omits Content-Length.
      const totalBytes = progress.totalBytes > 0 ? progress.totalBytes : spec.approxBytes;
      onProgress?.({
        bytesWritten: progress.bytesWritten,
        totalBytes,
        percent: totalBytes > 0 ? (progress.bytesWritten / totalBytes) * 100 : 0,
      });
    });

    this.tasks.set(modelId, { cancel: () => task.cancel() });

    try {
      await task.downloadAsync();
    } finally {
      subscription.remove();
      task.release();
      this.tasks.delete(modelId);
    }

    if (!destination.exists) throw new Error('MODEL_DOWNLOAD_FAILED');

    if (!this.isInstalled(modelId)) {
      destination.delete();
      throw new Error('MODEL_DOWNLOAD_INCOMPLETE');
    }

    onVerifying?.();
    // One frame for the "checking" state to reach the screen before hashing.
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (!this.verify(modelId)) {
      // Never leave a damaged model where the engine would load it.
      destination.delete();
      throw new Error('MODEL_DOWNLOAD_CORRUPT');
    }

    return this.installed(modelId)!;
  }

  cancelDownload(modelId: string): void {
    this.tasks.get(modelId)?.cancel();
  }

  remove(modelId: string): void {
    const file = this.fileFor(modelId);
    if (file.exists) file.delete();
  }
}

export const modelManager = new ModelManager();
