import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { modelRuntime, type ModelRuntime } from './ModelRuntime';

/**
 * Releases loaded models whenever the app leaves the foreground.
 *
 * iOS reclaims memory from backgrounded apps most aggressively, and a process
 * holding ~1.2 GB of model weights is the first one killed. Reloading on
 * return costs a few seconds; being killed costs the user their place in the
 * app, so the trade is clearly worth it.
 *
 * Mount once, at the root.
 */
export function useModelLifecycle(runtime: ModelRuntime = modelRuntime): void {
  useEffect(() => {
    const onChange = (status: AppStateStatus) => {
      if (status === 'background' || status === 'inactive') {
        // Fire and forget: eviction must not block the transition, and an
        // engine that is pinned by in-flight work is skipped by design.
        void runtime.releaseAll('pressure');
      }
    };

    const subscription = AppState.addEventListener('change', onChange);

    // Also release on a low-memory warning while still in the foreground.
    // 'memoryWarning' is a documented AppState event in React Native 0.86.
    const memoryWarning = AppState.addEventListener('memoryWarning', () => {
      void runtime.releaseAll('pressure');
    });

    return () => {
      subscription.remove();
      memoryWarning.remove();
      void runtime.releaseAll('manual');
    };
  }, [runtime]);
}
