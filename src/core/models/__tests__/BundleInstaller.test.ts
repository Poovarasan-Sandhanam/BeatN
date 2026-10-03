import { BundleInstaller, type BundleProgress, type ModelStore } from '../BundleInstaller';
import { getBundle } from '../bundles';
import { getModelSpec } from '../catalog';

const bundle = getBundle('standard');
const sttBytes = getModelSpec(bundle.sttModelId).approxBytes;
const llmBytes = getModelSpec(bundle.llmModelId).approxBytes;
const totalBytes = sttBytes + llmBytes;

/** Records calls and lets each download be driven tick by tick. */
class FakeStore implements ModelStore {
  installed = new Set<string>();
  downloadOrder: string[] = [];
  cancelled: string[] = [];
  private emitters = new Map<string, (info: { bytesWritten: number }) => void>();

  isInstalled(modelId: string): boolean {
    return this.installed.has(modelId);
  }

  async download(
    modelId: string,
    onProgress?: (info: { bytesWritten: number; totalBytes: number; percent: number }) => void,
  ) {
    this.downloadOrder.push(modelId);
    const spec = getModelSpec(modelId);
    this.emitters.set(modelId, ({ bytesWritten }) =>
      onProgress?.({
        bytesWritten,
        totalBytes: spec.approxBytes,
        percent: (bytesWritten / spec.approxBytes) * 100,
      }),
    );
    // Emit a midpoint tick, then complete.
    this.emitters.get(modelId)?.({ bytesWritten: Math.floor(spec.approxBytes / 2) });
    this.installed.add(modelId);
    return { spec, path: `/models/${modelId}`, sizeBytes: spec.approxBytes };
  }

  cancelDownload(modelId: string): void {
    this.cancelled.push(modelId);
  }
}

describe('BundleInstaller', () => {
  it('reports a fresh bundle as not installed', () => {
    const installer = new BundleInstaller(new FakeStore());
    expect(installer.isInstalled(bundle)).toBe(false);
    expect(installer.missingModelIds(bundle)).toEqual([bundle.sttModelId, bundle.llmModelId]);
  });

  it('quotes only the bytes still needed', () => {
    const store = new FakeStore();
    store.installed.add(bundle.sttModelId);
    const installer = new BundleInstaller(store);

    expect(installer.remainingBytes(bundle)).toBe(llmBytes);
  });

  it('downloads speech before the language model', async () => {
    const store = new FakeStore();
    await new BundleInstaller(store).install(bundle);
    expect(store.downloadOrder).toEqual([bundle.sttModelId, bundle.llmModelId]);
  });

  it('reports progress weighted by size, not by model count', async () => {
    const store = new FakeStore();
    const seen: BundleProgress[] = [];
    await new BundleInstaller(store).install(bundle, (p) => seen.push({ ...p }));

    // Halfway through the small speech model is a small fraction of the whole,
    // not 25%.
    const midStt = seen.find((p) => p.currentModelId === bundle.sttModelId && p.bytesWritten > 0);
    expect(midStt).toBeDefined();
    expect(midStt!.overall).toBeCloseTo(sttBytes / 2 / totalBytes, 5);
    expect(midStt!.overall).toBeLessThan(0.1);
  });

  it('ends at exactly 1 with everything counted', async () => {
    const store = new FakeStore();
    const seen: BundleProgress[] = [];
    await new BundleInstaller(store).install(bundle, (p) => seen.push({ ...p }));

    const last = seen[seen.length - 1];
    expect(last.overall).toBe(1);
    expect(last.bytesWritten).toBe(totalBytes);
    expect(last.completedCount).toBe(2);
    expect(last.currentModelId).toBeNull();
  });

  it('never reports progress above 1 when a server over-reports bytes', async () => {
    const store = new FakeStore();
    jest
      .spyOn(store, 'download')
      .mockImplementation(async (modelId: string, onProgress?: (i: never) => void) => {
        const spec = getModelSpec(modelId);
        // Claim 3x the expected size.
        (onProgress as unknown as (i: { bytesWritten: number }) => void)?.({
          bytesWritten: spec.approxBytes * 3,
        });
        store.installed.add(modelId);
        return { spec, path: `/models/${modelId}`, sizeBytes: spec.approxBytes };
      });

    const seen: BundleProgress[] = [];
    await new BundleInstaller(store).install(bundle, (p) => seen.push({ ...p }));

    for (const progress of seen) {
      expect(progress.overall).toBeLessThanOrEqual(1);
      expect(progress.bytesWritten).toBeLessThanOrEqual(totalBytes);
    }
  });

  it('resumes visibly: an already-installed model starts progress above zero', async () => {
    const store = new FakeStore();
    store.installed.add(bundle.sttModelId);
    const seen: BundleProgress[] = [];

    await new BundleInstaller(store).install(bundle, (p) => seen.push({ ...p }));

    expect(seen[0].overall).toBeCloseTo(sttBytes / totalBytes, 5);
    expect(seen[0].completedCount).toBe(1);
    expect(store.downloadOrder).toEqual([bundle.llmModelId]);
  });

  it('does nothing when the bundle is already complete', async () => {
    const store = new FakeStore();
    store.installed.add(bundle.sttModelId);
    store.installed.add(bundle.llmModelId);
    const installer = new BundleInstaller(store);

    const seen: BundleProgress[] = [];
    await installer.install(bundle, (p) => seen.push({ ...p }));

    expect(store.downloadOrder).toEqual([]);
    expect(installer.isInstalled(bundle)).toBe(true);
    expect(seen[seen.length - 1].overall).toBe(1);
  });

  it('cancels the download in flight', async () => {
    const store = new FakeStore();
    const installer = new BundleInstaller(store);

    jest.spyOn(store, 'download').mockImplementation(async (modelId: string) => {
      // Cancel while this one is "in flight".
      installer.cancel();
      const spec = getModelSpec(modelId);
      store.installed.add(modelId);
      return { spec, path: `/models/${modelId}`, sizeBytes: spec.approxBytes };
    });

    await expect(installer.install(bundle)).rejects.toThrow('BUNDLE_INSTALL_CANCELLED');
    expect(store.cancelled).toEqual([bundle.sttModelId]);
  });
});
