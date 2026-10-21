import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { JournalEntry } from '../../domain/entry/JournalEntry';
import { useServices } from '../../services/ServiceProvider';
import { formatDuration } from '../../shared/format';
import { useTheme } from '../../shared/theme';
import { Button, Card, Chip, FadeIn, Glyph, IconButton, PressableScale, Screen, Text } from '../../shared/ui';
import {
  PROCESSING_STEPS,
  describeStatus,
  formatClockTime,
  formatEntryDate,
  processingStep,
  titleOf,
} from '../home/entryStatus';
import { moodLook } from '../home/mood';

export default function EntryDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const services = useServices();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [entry, setEntry] = useState<JournalEntry | null | undefined>(undefined);

  // `isCancelled` lets the effect drop a result that arrived after unmount.
  const load = useCallback(
    async (isCancelled: () => boolean = () => false) => {
      if (!services || !id) return;
      const next = await services.journal.findById(id);
      if (!isCancelled()) setEntry(next);
    },
    [services, id],
  );

  useEffect(() => {
    let cancelled = false;
    // `load` awaits the database before setting state, so this is not the
    // synchronous cascade the rule guards against — but the rule cannot see
    // through the callback. The cancellation guard handles unmount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load, services?.revision]);

  const confirmDelete = useCallback(() => {
    if (!entry) return;
    Alert.alert('Delete this entry?', 'The recording, transcript and reflection are removed from this phone. This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await services?.journal.delete(entry.id);
          router.back();
        },
      },
    ]);
  }, [entry, router, services]);

  if (entry === undefined) {
    return (
      <Screen centred scroll={false}>
        <ActivityIndicator color={theme.colors.inkFaint} />
      </Screen>
    );
  }

  if (entry === null) {
    return (
      <Screen centred scroll={false}>
        <Text variant="title" align="center">
          This entry is gone.
        </Text>
        <Text variant="body" tone="muted" align="center">
          It may have been deleted.
        </Text>
        <Button label="Back to journal" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const status = describeStatus(entry.processingState);
  const step = processingStep(entry.processingState);
  const title = titleOf(entry);
  const mood = entry.mood && entry.mood.value !== 'unknown' ? moodLook(entry.mood.value, theme.isDark) : null;

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.background }]}>
      <View
        style={[
          styles.topBar,
          {
            paddingTop: insets.top + theme.spacing.sm,
            paddingHorizontal: theme.spacing.lg,
            paddingBottom: theme.spacing.sm,
            backgroundColor: theme.colors.background,
          },
        ]}>
        <IconButton icon="back" accessibilityLabel="Back" onPress={() => router.back()} />
        <Pressable onPress={confirmDelete} accessibilityRole="button" hitSlop={12}>
          <Text variant="captionStrong" tone="danger">
            Delete
          </Text>
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.xl,
          paddingTop: theme.spacing.md,
          paddingBottom: insets.bottom + theme.spacing.xxxl,
          gap: theme.spacing.xl,
        }}>
        <FadeIn style={{ gap: theme.spacing.md }}>
          <Text variant="label" tone="faint">
            {formatEntryDate(entry.createdAt)} · {formatClockTime(entry.createdAt)}
          </Text>
          <Text variant="display">{title ?? 'Untitled entry'}</Text>
          <View style={styles.chips}>
            <Chip label={formatDuration(entry.audio.durationMs)} />
            {mood && <Chip label={mood.label} dot={mood.color} />}
            {entry.topics.map((topic) => (
              <Chip key={topic.name} label={topic.name} />
            ))}
          </View>
        </FadeIn>

        {status.busy && step !== null && (
          <FadeIn delay={60}>
            <Card variant="flat">
              <Stepper current={step} />
              <Text variant="caption" tone="muted">
                {status.label}. You can leave — it carries on in the background.
              </Text>
            </Card>
          </FadeIn>
        )}

        {entry.processingState === 'failed' && (
          <FadeIn delay={60}>
            <Card variant="flat" style={{ backgroundColor: theme.colors.dangerSoft, borderColor: 'transparent' }}>
              <Text variant="bodyStrong" tone="danger">
                Processing didn’t finish.
              </Text>
              <Text variant="caption" tone="muted">
                Your recording is safe.{entry.processingError ? ` ${entry.processingError}` : ''}
              </Text>
              <Button
                label="Try again"
                variant="secondary"
                onPress={async () => {
                  await services?.journal.retry(entry.id);
                  await load();
                }}
              />
            </Card>
          </FadeIn>
        )}

        {entry.audio.uri && (
          <FadeIn delay={100}>
            <AudioPlayback uri={entry.audio.uri} fallbackDurationMs={entry.audio.durationMs} />
          </FadeIn>
        )}

        {entry.reflection && (
          <FadeIn delay={140}>
            <Card title="Reflection" variant="tinted">
              <Text variant="reading">{entry.reflection.summary}</Text>
              <Text variant="caption" tone="muted">
                Written on this phone{mood ? ` · feels ${mood.label.toLowerCase()}, ${((entry.mood?.confidence ?? 0) * 100).toFixed(0)}% sure` : ''}. BeatN is a journal, not a therapist.
              </Text>
            </Card>
          </FadeIn>
        )}

        {entry.transcript && (
          <FadeIn delay={180} style={{ gap: theme.spacing.md }}>
            <Text variant="label" tone="muted">
              What you said
            </Text>
            <Text variant="reading" selectable>
              {entry.transcript.text}
            </Text>
          </FadeIn>
        )}
      </ScrollView>
    </View>
  );
}

function Stepper({ current }: { current: 0 | 1 | 2 | 3 }) {
  const theme = useTheme();
  return (
    <View
      style={styles.stepper}
      accessible
      accessibilityLabel={`Step ${Math.min(current + 1, 3)} of 3: ${PROCESSING_STEPS[Math.min(current, 2)]}`}>
      {PROCESSING_STEPS.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <View key={label} style={[styles.step, { gap: theme.spacing.xs }]}>
            <View
              style={[
                styles.stepBar,
                {
                  backgroundColor: done || active ? theme.colors.accent : theme.colors.surfaceSunken,
                  opacity: active ? 0.55 : 1,
                },
              ]}
            />
            <Text variant="captionStrong" tone={done || active ? 'accent' : 'faint'}>
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function AudioPlayback({ uri, fallbackDurationMs }: { uri: string; fallbackDurationMs: number }) {
  const theme = useTheme();
  // The hook creates the player and releases it on unmount.
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);
  const [trackWidth, setTrackWidth] = useState(0);

  const duration = status.duration > 0 ? status.duration : fallbackDurationMs / 1000;
  const fraction = duration > 0 ? Math.min(1, status.currentTime / duration) : 0;

  const toggle = useCallback(() => {
    if (status.playing) {
      player.pause();
      return;
    }
    // Restart once playback has reached the end.
    if (status.didJustFinish || fraction >= 1) void player.seekTo(0);
    player.play();
  }, [player, status.playing, status.didJustFinish, fraction]);

  const seek = useCallback(
    (x: number) => {
      if (trackWidth <= 0 || duration <= 0) return;
      void player.seekTo(Math.max(0, Math.min(1, x / trackWidth)) * duration);
    },
    [player, trackWidth, duration],
  );

  const [progress] = useState(() => new Animated.Value(fraction));
  useEffect(() => {
    Animated.timing(progress, { toValue: fraction, duration: 250, useNativeDriver: false }).start();
  }, [progress, fraction]);

  return (
    <Card variant="raised">
      <View style={styles.playRow}>
        <PressableScale
          onPress={toggle}
          disabled={!status.isLoaded}
          pressedScale={0.9}
          accessibilityRole="button"
          accessibilityLabel={status.playing ? 'Pause' : 'Play recording'}
          style={[
            styles.playButton,
            { backgroundColor: theme.colors.ink, opacity: status.isLoaded ? 1 : 0.4 },
          ]}>
          <Glyph name={status.playing ? 'pause' : 'play'} color={theme.colors.background} size={18} />
        </PressableScale>

        <View style={[styles.fill, { gap: theme.spacing.sm }]}>
          <Pressable
            onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
            onPress={(e) => seek(e.nativeEvent.locationX)}
            accessibilityRole="adjustable"
            accessibilityLabel="Playback position"
            accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(status.currentTime) }}
            hitSlop={{ top: 14, bottom: 14 }}
            style={styles.trackHit}>
            <View style={[styles.track, { backgroundColor: theme.colors.surfaceSunken }]}>
              <Animated.View
                style={[
                  styles.trackFill,
                  {
                    backgroundColor: theme.colors.accent,
                    width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                  },
                ]}
              />
            </View>
          </Pressable>
          <View style={styles.timeRow}>
            <Text variant="caption" tone="muted" style={styles.tabular}>
              {formatDuration(status.currentTime * 1000)}
            </Text>
            <Text variant="caption" tone="faint" style={styles.tabular}>
              {formatDuration(duration * 1000)}
            </Text>
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stepper: { flexDirection: 'row', gap: 8 },
  step: { flex: 1 },
  stepBar: { height: 4, borderRadius: 2 },
  playRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  playButton: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  trackHit: { justifyContent: 'center', height: 20 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  trackFill: { height: '100%', borderRadius: 2 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  tabular: { fontVariant: ['tabular-nums'] },
});
