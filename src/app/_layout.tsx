import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useModelLifecycle } from '../core/ai/useModelLifecycle';
import { BundleInstaller } from '../core/models/BundleInstaller';
import { DEFAULT_BUNDLE_ID, getBundle } from '../core/models/bundles';
import OnboardingScreen from '../features/onboarding/OnboardingScreen';
import { ServiceProvider } from '../services/ServiceProvider';
import { ThemeProvider, useTheme } from '../shared/theme';
import { ErrorBoundary, Glyph } from '../shared/ui';

// PROVISIONAL until Step 1 produces real-device benchmarks. See BENCHMARKS.md.
const bundle = getBundle(DEFAULT_BUNDLE_ID);

type Startup = 'checking' | 'ready' | 'needsModels';

// Keep the native launch screen up until we know which screen comes first, so
// the app opens straight onto onboarding or the journal with no blank frame.
// Module scope, not inside a component, per the expo-splash-screen docs.
void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 300, fade: true });

export default function RootLayout() {
  return (
    <ThemeProvider>
      <StatusBar style="auto" />
      <ErrorBoundary>
        <Root />
      </ErrorBoundary>
    </ThemeProvider>
  );
}

function Root() {
  const [startup, setStartup] = useState<Startup>('checking');

  // In an effect, not a useState initialiser: this touches the filesystem and
  // creates the models directory on first launch. A throw during render would
  // blank the screen before the error boundary could catch it.
  useEffect(() => {
    let cancelled = false;
    // Deferred to a microtask so the state update is not synchronous with the
    // effect, which would cascade an extra render pass on every launch.
    void Promise.resolve()
      .then(() => new BundleInstaller().isInstalled(bundle))
      .catch(() => false)
      .then((installed) => {
        if (!cancelled) setStartup(installed ? 'ready' : 'needsModels');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Releases model weights when the app backgrounds.
  useModelLifecycle();

  useEffect(() => {
    if (startup !== 'checking') SplashScreen.hide();
  }, [startup]);

  const handleReady = useCallback(() => setStartup('ready'), []);

  if (startup === 'checking') return <Splash />;
  if (startup === 'needsModels') {
    return <OnboardingScreen bundle={bundle} onReady={handleReady} />;
  }

  return (
    <ServiceProvider>
      <Navigator />
    </ServiceProvider>
  );
}

function Navigator() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.ink,
        contentStyle: { backgroundColor: theme.colors.background },
      }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      {/* Full screen, and no swipe-to-dismiss: a stray swipe must never
          throw away a recording. Closing goes through the screen's own
          button, which confirms first. */}
      <Stack.Screen
        name="record"
        options={{
          presentation: 'fullScreenModal',
          animation: 'slide_from_bottom',
          gestureEnabled: false,
          title: 'New entry',
          headerShown: false,
        }}
      />
      <Stack.Screen name="entry/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="dev" options={{ title: 'Developer' }} />
    </Stack>
  );
}

/**
 * A pixel match for the native launch screen (app.json → expo-splash-screen),
 * drawn underneath it. If the native splash ever lifts early, nothing jumps.
 */
function Splash() {
  const theme = useTheme();
  return (
    <View style={[styles.splash, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.mark, { backgroundColor: theme.colors.accent }]}>
        <Glyph name="mic" color={theme.colors.onAccent} size={MARK * (26 / 56)} />
      </View>
    </View>
  );
}

/** Same width as `imageWidth` in the app.json splash config. */
const MARK = 88;

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mark: {
    width: MARK,
    height: MARK,
    borderRadius: MARK * (18 / 56),
    alignItems: 'center',
    justifyContent: 'center',
  },
});
