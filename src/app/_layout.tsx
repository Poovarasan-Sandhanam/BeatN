import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { useModelLifecycle } from '../core/ai/useModelLifecycle';
import { BundleInstaller } from '../core/models/BundleInstaller';
import { DEFAULT_BUNDLE_ID, getBundle } from '../core/models/bundles';
import OnboardingScreen from '../features/onboarding/OnboardingScreen';
import { ServiceProvider } from '../services/ServiceProvider';
import { ThemeProvider, useTheme } from '../shared/theme';
import { ErrorBoundary, Screen, Text } from '../shared/ui';

// PROVISIONAL until Step 1 produces real-device benchmarks. See BENCHMARKS.md.
const bundle = getBundle(DEFAULT_BUNDLE_ID);

type Startup = 'checking' | 'ready' | 'needsModels';

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
    try {
      setStartup(new BundleInstaller().isInstalled(bundle) ? 'ready' : 'needsModels');
    } catch {
      setStartup('needsModels');
    }
  }, []);

  // Releases model weights when the app backgrounds.
  useModelLifecycle();

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
      <Stack.Screen
        name="record"
        options={{ presentation: 'modal', title: 'New entry', headerShown: false }}
      />
      <Stack.Screen name="entry/[id]" options={{ title: '' }} />
      <Stack.Screen name="dev" options={{ title: 'Developer' }} />
    </Stack>
  );
}

function Splash() {
  return (
    <Screen centred scroll={false}>
      <ActivityIndicator />
      <Text variant="caption" tone="muted" align="center">
        Starting BeatN…
      </Text>
    </Screen>
  );
}
