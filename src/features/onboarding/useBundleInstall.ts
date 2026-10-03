import { useCallback, useEffect, useRef, useState } from 'react';

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
  const installer = useRef(new BundleInstaller()).current;

  const [phase, setPhase] = useState<InstallPhase>('idle');
  const [progress, setProgress] = useState<BundleProgress | null>(null);
  const [errorText, setErrorText] = useState('');

  // `remainingBytes` stats the filesystem once per model. Reading it during
  // render meant two sync stat() calls on every progress tick — dozens a
  // second during a 1.2 GB download, all on the JS thread. Measure it when
  // the set of installed models actually changes instead.
  const [remainingBytes, setRemainingBytes] = useState(0);

  useEffect(() => {
    try {
      setRemainingBytes(installer.remainingBytes(bundle));
      if (installer.isInstalled(bundle)) setPhase('done');
    } catch {
      // An unreadable models directory is reported by the download attempt.
    }
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
