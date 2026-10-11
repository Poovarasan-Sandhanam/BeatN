import { useCallback, useEffect, useState } from 'react';

import { BundleInstaller, type BundleProgress } from '../../core/models/BundleInstaller';
import type { ModelBundle } from '../../core/models/bundles';
import { describeError, isCancellation } from '../../shared/errors';

export type InstallPhase = 'idle' | 'installing' | 'error' | 'done';

/**
 * Drives a one-off bundle download for the onboarding screen.
 *
 * Deliberately does not retry by itself: a failed 1.2 GB download should ask
 * the user, not silently burn their mobile data a second time.
 */
export function useBundleInstall(bundle: ModelBundle) {
  // Lazy state, not a ref: `useRef(new X())` constructs on every render and
  // reading `.current` during render is a lint error.
  const [installer] = useState(() => new BundleInstaller());

  const [phase, setPhase] = useState<InstallPhase>('idle');
  const [progress, setProgress] = useState<BundleProgress | null>(null);
  const [errorText, setErrorText] = useState('');

  // `remainingBytes` stats the filesystem once per model. Reading it during
  // render meant two sync stat() calls on every progress tick — dozens a
  // second during a 1.2 GB download, all on the JS thread. Measure it when
  // the set of installed models actually changes instead.
  const [remainingBytes, setRemainingBytes] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Deferred to a microtask: these calls stat the filesystem, and setting
    // state synchronously inside an effect cascades an extra render.
    void Promise.resolve()
      .then(() => ({
        remaining: installer.remainingBytes(bundle),
        installed: installer.isInstalled(bundle),
      }))
      .catch(() => null)
      .then((result) => {
        // An unreadable models directory is reported by the download attempt.
        if (cancelled || !result) return;
        setRemainingBytes(result.remaining);
        if (result.installed) setPhase('done');
      });
    return () => {
      cancelled = true;
    };
  }, [bundle, installer, phase]);

  const start = useCallback(async () => {
    setPhase('installing');
    setErrorText('');
    try {
      await installer.install(bundle, setProgress);
      setPhase('done');
    } catch (error) {
      if (isCancellation(error)) {
        setPhase('idle');
        setProgress(null);
        return;
      }
      setErrorText(describeError(error));
      setPhase('error');
    }
  }, [bundle, installer]);

  const cancel = useCallback(() => {
    installer.cancel();
  }, [installer]);

  return { phase, progress, errorText, remainingBytes, start, cancel };
}
