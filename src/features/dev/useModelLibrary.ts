import { useCallback, useState } from 'react';

import { modelManager } from '../../core/models/ModelManager';
import { MODEL_CATALOG, type ModelSpec } from '../../core/models/catalog';
import { describeError } from '../../shared/errors';

export interface ModelEntry {
  spec: ModelSpec;
  installed: boolean;
  /** 0..100 while downloading, null otherwise. */
  progress: number | null;
}

/**
 * Model management for the developer screen.
 *
 * This is where `ModelManager.remove()` finally gets a caller — the bundle is
 * over a gigabyte, and until now there was no way to reclaim it short of
 * deleting the app.
 */
export function useModelLibrary() {
  const [tick, setTick] = useState(0);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [errorText, setErrorText] = useState('');

  const refresh = useCallback(() => setTick((value) => value + 1), []);

  const entries: ModelEntry[] = MODEL_CATALOG.map((spec) => {
    void tick; // re-evaluate after a download or removal
    return {
      spec,
      installed: modelManager.isInstalled(spec.id),
      progress: progress[spec.id] ?? null,
    };
  });

  const download = useCallback(
    async (modelId: string) => {
      setErrorText('');
      setProgress((previous) => ({ ...previous, [modelId]: 0 }));
      try {
        await modelManager.download(modelId, ({ percent }) => {
          setProgress((previous) => ({ ...previous, [modelId]: percent }));
        });
      } catch (error) {
        setErrorText(describeError(error));
      } finally {
        setProgress((previous) => {
          const next = { ...previous };
          delete next[modelId];
          return next;
        });
        refresh();
      }
    },
    [refresh],
  );

  const remove = useCallback(
    (modelId: string) => {
      setErrorText('');
      try {
        modelManager.remove(modelId);
      } catch (error) {
        setErrorText(describeError(error));
      } finally {
        refresh();
      }
    },
    [refresh],
  );

  const cancel = useCallback((modelId: string) => {
    modelManager.cancelDownload(modelId);
  }, []);

  return { entries, download, remove, cancel, errorText, refresh };
}
