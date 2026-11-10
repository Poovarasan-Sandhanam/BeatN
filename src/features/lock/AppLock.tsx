import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { authenticate, canAuthenticate } from '../../core/security/deviceAuth';
import { useTheme } from '../../shared/theme';
import { Button, FadeIn, Glyph, Text } from '../../shared/ui';
import { shouldLockOnReturn } from './lockPolicy';

type LockState = 'checking' | 'locked' | 'unlocked' | 'disabled';

/**
 * Keeps the journal behind Face ID / Touch ID / the device passcode.
 *
 * The app stays mounted underneath — navigation, a recording in progress and
 * the processing queue all carry on — and an opaque layer covers it. Two
 * layers, for two different threats:
 *   - the lock, after launch and after 30 s away: someone holding the phone;
 *   - the cover, whenever the app is not active: the app-switcher snapshot,
 *     which iOS and Android take of whatever is on screen.
 */
export function AppLock({ children }: { children: ReactNode }) {
  const [lock, setLock] = useState<LockState>('checking');
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [prompting, setPrompting] = useState(false);
  const leftAt = useRef<number | null>(null);
  // Mirrors `lock` for the AppState listener, which outlives any one render.
  const lockRef = useRef<LockState>('checking');
  useEffect(() => {
    lockRef.current = lock;
  }, [lock]);

  const unlock = useCallback(async () => {
    setPrompting(true);
    const outcome = await authenticate();
    setPrompting(false);
    if (outcome === 'success') setLock('unlocked');
    // Security was removed from the device since launch: nothing to check against.
    if (outcome === 'unavailable') setLock('disabled');
  }, []);

  useEffect(() => {
    let cancelled = false;
    void canAuthenticate().then((available) => {
      if (cancelled) return;
      setLock(available ? 'locked' : 'disabled');
      if (available) void unlock();
    });
    return () => {
      cancelled = true;
    };
  }, [unlock]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      setActive(next === 'active');
      // 'background' only: the Face ID sheet itself makes iOS report
      // 'inactive', and treating that as leaving would loop the prompt.
      if (next === 'background') {
        leftAt.current = Date.now();
        return;
      }
      if (next === 'active') {
        const relock = shouldLockOnReturn(leftAt.current, Date.now());
        leftAt.current = null;
        if (!relock || lockRef.current !== 'unlocked') return;
        setLock('locked');
        void unlock();
      }
    });
    return () => subscription.remove();
  }, [unlock]);

  const showLock = lock === 'locked' || lock === 'checking';
  const showCover = !showLock && lock !== 'disabled' && !active;

  return (
    <View style={styles.fill}>
      {children}
      {showLock && <LockScreen checking={lock === 'checking'} prompting={prompting} onUnlock={unlock} />}
      {showCover && <PrivacyCover />}
    </View>
  );
}

function LockScreen({
  checking,
  prompting,
  onUnlock,
}: {
  checking: boolean;
  prompting: boolean;
  onUnlock: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        styles.centre,
        {
          backgroundColor: theme.colors.background,
          paddingBottom: insets.bottom + theme.spacing.xl,
          paddingHorizontal: theme.spacing.xl,
        },
      ]}
      accessibilityViewIsModal>
      <View style={[styles.fill, styles.centre, { gap: theme.spacing.lg }]}>
        <Mark />
        {!checking && (
          <FadeIn style={{ gap: theme.spacing.sm }}>
            <Text variant="title" align="center">
              Your journal is locked
            </Text>
            <Text variant="body" tone="muted" align="center">
              Only you can open it.
            </Text>
          </FadeIn>
        )}
      </View>
      {!checking && (
        <FadeIn style={styles.stretch}>
          <Button label="Unlock" icon="lock" size="large" loading={prompting} onPress={onUnlock} />
        </FadeIn>
      )}
    </View>
  );
}

/** Shown in the app switcher instead of the journal. Matches the launch screen. */
function PrivacyCover() {
  const theme = useTheme();
  return (
    <View
      style={[StyleSheet.absoluteFill, styles.centre, { backgroundColor: theme.colors.background }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Mark />
    </View>
  );
}

const MARK = 88;

function Mark() {
  const theme = useTheme();
  return (
    <View style={[styles.mark, { backgroundColor: theme.colors.accent }]}>
      <Glyph name="mic" color={theme.colors.onAccent} size={MARK * (26 / 56)} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centre: { alignItems: 'center', justifyContent: 'center' },
  stretch: { alignSelf: 'stretch' },
  mark: {
    width: MARK,
    height: MARK,
    borderRadius: MARK * (18 / 56),
    alignItems: 'center',
    justifyContent: 'center',
  },
});
