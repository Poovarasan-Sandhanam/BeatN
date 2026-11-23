import { Redirect } from 'expo-router';

import DevScreen from '../features/dev/DevScreen';

/**
 * Developer tools exist in development builds only. Every file in src/app is
 * reachable by link (beatn://dev), so in a release build this route sends you
 * to the journal instead: App Review guideline 2.3.1 forbids hidden features.
 */
export default function DevRoute() {
  if (!__DEV__) return <Redirect href="/" />;
  return <DevScreen />;
}
