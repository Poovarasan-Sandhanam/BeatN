import * as SplashScreen from 'expo-splash-screen';
import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Button } from './Button';
import { Screen } from './Screen';
import { Text } from './Text';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last line of defence against a blank screen.
 *
 * On a phone there is no console to check, so an uncaught render error would
 * otherwise show as white nothing. This at least names the failure and offers
 * a way back.
 *
 * The message is shown because this is a development build used for
 * benchmarking. Before release it becomes a generic apology — an error string
 * can contain a file path, and must never contain journal content.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // A crash during startup would otherwise leave the launch screen up
    // forever, hiding this message behind it.
    SplashScreen.hide();
    // Deliberately not logged: see the privacy rule in SYSTEM_DESIGN.md §10.
    // A crash reporter with content redaction arrives in Phase 11.
  }

  private reset = () => this.setState({ error: null });

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <Screen centred scroll={false}>
        <Text variant="display">Something went wrong.</Text>
        <Text variant="body" tone="muted">
          BeatN hit an unexpected error. Your saved entries are safe.
        </Text>
        <Text variant="mono" tone="faint">
          {error.message}
        </Text>
        <Button label="Try again" onPress={this.reset} />
      </Screen>
    );
  }
}
