import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet } from 'react-native';

import { useModelLifecycle } from './src/core/ai/useModelLifecycle';
import { BundleInstaller } from './src/core/models/BundleInstaller';
import { DEFAULT_BUNDLE_ID, getBundle } from './src/core/models/bundles';
import OnboardingScreen from './src/features/onboarding/OnboardingScreen';
import { ThemeProvider } from './src/shared/theme';
import { ErrorBoundary, Screen, Text } from './src/shared/ui';
import SpikeScreen from './src/spike/SpikeScreen';

// PROVISIONAL until Step 1 produces real-device benchmarks. See BENCHMARKS.md.
const bundle = getBundle(DEFAULT_BUNDLE_ID);

type Startup = { status: 'checking' } | { status: 'ready' } | { status: 'needsModels' };

export default function App() {
  const [startup, setStartup] = useState<Startup>({ status: 'checking' });

  // Deliberately in an effect, not a useState initialiser. `isInstalled`
  // touches the filesystem and creates the models directory on first launch;
  // doing that during render means a throw becomes a blank screen before
  // anything — including the error boundary's own tree — has mounted.
  useEffect(() => {
    try {
      setStartup(
        new BundleInstaller().isInstalled(bundle) ? { status: 'ready' } : { status: 'needsModels' },
      );
    } catch {
      // Treat an unreadable models directory as "not installed": onboarding
      // will try the download and report a real error if it also fails.
      setStartup({ status: 'needsModels' });
    }
  }, []);

  const handleReady = useCallback(() => setStartup({ status: 'ready' }), []);

  // Releases model weights when the app backgrounds. Must be mounted at the
  // root, above anything that runs inference.
  useModelLifecycle();

  return (
    <ThemeProvider>
      <SafeAreaView style={styles.root}>
        <StatusBar style="auto" />
        <ErrorBoundary>
          {startup.status === 'checking' ? (
            <Screen centred scroll={false}>
              <ActivityIndicator />
              <Text variant="caption" tone="muted" align="center">
                Starting BeatN…
              </Text>
            </Screen>
          ) : startup.status === 'ready' ? (
            <SpikeScreen />
          ) : (
            <OnboardingScreen bundle={bundle} onReady={handleReady} />
          )}
        </ErrorBoundary>
      </SafeAreaView>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
