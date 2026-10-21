import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useWavRecorder } from '../../core/audio/useWavRecorder';
import { useServices } from '../../services/ServiceProvider';
import { describeError, isPermissionError } from '../../shared/errors';
import { formatDuration } from '../../shared/format';
import { useTheme } from '../../shared/theme';
import { Button, Card, FadeIn, Glyph, IconButton, PressableScale, Text } from '../../shared/ui';
import { PROMPTS, nextPromptIndex } from './prompts';

/** Bars in the live waveform. One per audio buffer, newest on the right. */
const WAVE_BARS = 48;
/** Below this, discarding needs no confirmation — it was a false start. */
const CONFIRM_DISCARD_AFTER_MS = 5_000;

export default function RecordScreen() {
  const theme = useTheme();
  const router = useRouter();
  const services = useServices();
  const recorder = useWavRecorder();
  const insets = useSafeAreaInsets();

  const [errorText, setErrorText] = useState('');
  const [needsSettings, setNeedsSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [promptIndex, setPromptIndex] = useState(() => Math.floor(Math.random() * PROMPTS.length));

  const isRecording = recorder.state === 'recording';

  // Waveform history. Each new buffer advances `durationMs`, so that is the
  // tick. Updating state during render on a changed input is React's
  // sanctioned alternative to an effect here.
  const [wave, setWave] = useState<number[]>([]);
  const [lastTick, setLastTick] = useState(recorder.durationMs);
  if (recorder.durationMs !== lastTick) {
    setLastTick(recorder.durationMs);
    setWave(recorder.durationMs === 0 ? [] : (prev) => [...prev.slice(-(WAVE_BARS - 1)), recorder.level]);
  }

  const report = useCallback((error: unknown) => {
    setErrorText(describeError(error));
    setNeedsSettings(isPermissionError(error));
  }, []);

  const start = useCallback(async () => {
    setErrorText('');
    setNeedsSettings(false);
    try {
      await recorder.start();
    } catch (error) {
      report(error);
    }
  }, [recorder, report]);

  /**
   * Save and leave. No AI runs here: the entry row and its job are written,
   * then we navigate straight back. The user never watches a spinner for
   * something that takes tens of seconds.
   */
  const stop = useCallback(async () => {
    if (!services) return;
    setSaving(true);
    try {
      const recording = await recorder.stop();
      await services.journal.createEntryFromRecording(recording);
      router.back();
    } catch (error) {
      report(error);
    } finally {
      setSaving(false);
    }
  }, [recorder, router, services, report]);

  const discard = useCallback(() => {
    recorder.cancel();
    router.back();
  }, [recorder, router]);

  const close = useCallback(() => {
    if (!isRecording || recorder.durationMs < CONFIRM_DISCARD_AFTER_MS) {
      discard();
      return;
    }
    Alert.alert('Discard this recording?', 'What you’ve said so far will not be saved.', [
      { text: 'Keep recording', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: discard },
    ]);
  }, [discard, isRecording, recorder.durationMs]);

  return (
    <View
      style={[
        styles.fill,
        {
          backgroundColor: theme.colors.background,
          paddingTop: insets.top + theme.spacing.sm,
          paddingBottom: insets.bottom + theme.spacing.xl,
          paddingHorizontal: theme.spacing.xl,
        },
      ]}>
      <View style={styles.topBar}>
        <IconButton
          icon="close"
          accessibilityLabel={isRecording ? 'Discard recording' : 'Close'}
          onPress={close}
          disabled={saving}
        />
        <View
          style={[
            styles.privacy,
            { backgroundColor: theme.colors.surfaceSunken, borderRadius: theme.radius.pill },
          ]}>
          <Glyph name="lock" color={theme.colors.inkMuted} size={11} />
          <Text variant="captionStrong" tone="muted">
            On this phone only
          </Text>
        </View>
        <View style={styles.topBarSpacer} />
      </View>

      <View style={[styles.fill, styles.centre, { gap: theme.spacing.xl }]}>
        {isRecording || saving ? (
          <>
            <View style={{ gap: theme.spacing.xs }}>
              <Text
                variant="timer"
                align="center"
                accessibilityRole="timer"
                accessibilityLabel={`Recording, ${formatDuration(recorder.durationMs)}`}>
                {formatDuration(recorder.durationMs)}
              </Text>
              <Text variant="caption" tone="muted" align="center">
                {saving ? 'Saving…' : 'Listening'}
              </Text>
            </View>
            <Waveform levels={wave} />
            <Text variant="reading" tone="faint" align="center" style={{ fontStyle: 'italic' }}>
              “{PROMPTS[promptIndex]}”
            </Text>
          </>
        ) : (
          <FadeIn style={{ gap: theme.spacing.lg, alignItems: 'center' }}>
            <Text variant="label" tone="faint">
              A place to start
            </Text>
            <Text variant="display" align="center">
              {PROMPTS[promptIndex]}
            </Text>
            <Pressable
              onPress={() => setPromptIndex(nextPromptIndex)}
              accessibilityRole="button"
              hitSlop={12}>
              <Text variant="captionStrong" tone="accent">
                Another prompt
              </Text>
            </Pressable>
          </FadeIn>
        )}
      </View>

      {errorText !== '' && (
        <Card variant="flat" style={{ marginBottom: theme.spacing.lg }}>
          <Text variant="body" tone="danger">
            {errorText}
          </Text>
          {needsSettings && (
            <Button label="Open Settings" variant="secondary" onPress={() => Linking.openSettings()} />
          )}
        </Card>
      )}

      <View style={[styles.centre, { gap: theme.spacing.md }]}>
        <RecordControl
          state={saving ? 'saving' : isRecording ? 'recording' : 'idle'}
          level={recorder.level}
          onPress={isRecording ? stop : start}
        />
        <Text variant="caption" tone="muted" align="center">
          {saving
            ? 'One moment'
            : isRecording
              ? 'Tap to finish. It’s transcribed in the background.'
              : 'Tap to start talking'}
        </Text>
      </View>
    </View>
  );
}

function Waveform({ levels }: { levels: number[] }) {
  const theme = useTheme();
  const padded = [...Array(Math.max(0, WAVE_BARS - levels.length)).fill(0), ...levels];

  return (
    <View style={styles.wave} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {padded.map((level, i) => (
        <View
          key={i}
          style={[
            styles.waveBar,
            {
              // A floor keeps silence visible as a quiet line rather than nothing.
              height: 4 + Math.min(1, level * 1.6) * 60,
              backgroundColor: theme.colors.recording,
              opacity: 0.25 + (i / WAVE_BARS) * 0.75,
            },
          ]}
        />
      ))}
    </View>
  );
}

const CONTROL = 84;

function RecordControl({
  state,
  level,
  onPress,
}: {
  state: 'idle' | 'recording' | 'saving';
  level: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  const [halo] = useState(() => new Animated.Value(0));

  // The halo swells with your voice, so you can see it is hearing you.
  useEffect(() => {
    Animated.spring(halo, {
      toValue: state === 'recording' ? Math.min(1, level * 2) : 0,
      useNativeDriver: true,
      speed: 30,
      bounciness: 0,
    }).start();
  }, [halo, level, state]);

  const recording = state === 'recording';
  const fill = state === 'idle' ? theme.colors.accent : theme.colors.recording;

  return (
    <View style={styles.controlBox}>
      <Animated.View
        style={[
          styles.halo,
          {
            backgroundColor: theme.colors.recordingSoft,
            opacity: recording ? 1 : 0,
            transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [1.05, 1.6] }) }],
          },
        ]}
      />
      <PressableScale
        onPress={onPress}
        disabled={state === 'saving'}
        pressedScale={0.92}
        accessibilityRole="button"
        accessibilityLabel={recording ? 'Stop and save' : 'Start recording'}
        style={[
          styles.control,
          {
            backgroundColor: fill,
            boxShadow: `0 10px 28px ${theme.colors.shadow}`,
          },
        ]}>
        {state === 'saving' ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Glyph
            name={recording ? 'stop' : 'mic'}
            color={state === 'idle' ? theme.colors.onAccent : '#FFFFFF'}
            size={recording ? 30 : 34}
          />
        )}
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centre: { alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topBarSpacer: { width: 40 },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6 },
  wave: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 72, gap: 3 },
  waveBar: { width: 3, borderRadius: 2 },
  controlBox: { width: CONTROL * 1.7, height: CONTROL * 1.7, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: CONTROL, height: CONTROL, borderRadius: CONTROL / 2 },
  control: {
    width: CONTROL,
    height: CONTROL,
    borderRadius: CONTROL / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
