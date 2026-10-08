import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { JournalEntry } from '../../domain/entry/JournalEntry';
import { useServices } from '../../services/ServiceProvider';
import { formatDuration } from '../../shared/format';
import { useTheme } from '../../shared/theme';
import { Button, Card, Screen, Text } from '../../shared/ui';
import { describeStatus, formatClockTime, formatEntryDate } from '../home/entryStatus';

export default function EntryDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const services = useServices();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [entry, setEntry] = useState<JournalEntry | null | undefined>(undefined);

  const load = useCallback(async () => {
    if (!services || !id) return;
    setEntry(await services.journal.findById(id));
  }, [services, id]);

  useEffect(() => {
    void load();
  }, [load, services?.revision]);

  if (entry === undefined) {
    return (
      <Screen centred scroll={false}>
        <ActivityIndicator />
      </Screen>
    );
  }

  if (entry === null) {
    return (
      <Screen centred scroll={false}>
        <Text variant="title">Entry not found.</Text>
        <Button label="Back to journal" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const status = describeStatus(entry.processingState);

  return (
    <Screen>
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="display">{formatEntryDate(entry.createdAt)}</Text>
        <Text variant="caption" tone="muted">
          {formatClockTime(entry.createdAt)} · {formatDuration(entry.audio.durationMs)}
        </Text>
      </View>

      {status.busy && (
        <Card>
          <View style={styles.statusRow}>
            <ActivityIndicator size="small" color={theme.colors.accent} />
            <Text variant="body" tone="accent">
              {status.label}…
            </Text>
          </View>
          <Text variant="caption" tone="muted">
            You can leave this screen — it carries on in the background.
          </Text>
        </Card>
      )}

      {entry.processingState === 'failed' && (
        <Card>
          <Text variant="bodyStrong" tone="danger">
            Processing did not finish.
          </Text>
          {entry.processingError && (
            <Text variant="caption" tone="muted">
              {entry.processingError}
            </Text>
          )}
          <Button
            label="Try again"
            variant="secondary"
            onPress={async () => {
              await services?.journal.retry(entry.id);
              await load();
            }}
          />
        </Card>
      )}

      {entry.audio.uri && <AudioPlayback uri={entry.audio.uri} />}

      {entry.reflection && (
        <Card title="Reflection">
          <Text variant="body">{entry.reflection.summary}</Text>
          {entry.mood && (
            <Text variant="caption" tone="muted">
              Mood: {entry.mood.value} · {(entry.mood.confidence * 100).toFixed(0)}% confidence
            </Text>
          )}
          {entry.topics.length > 0 && (
            <Text variant="caption" tone="muted">
              {entry.topics.map((topic) => topic.name).join(' · ')}
            </Text>
          )}
          <Text variant="caption" tone="faint">
            Generated on this device. BeatN is a journal, not a therapist.
          </Text>
        </Card>
      )}

      {entry.transcript && (
        <Card title="Transcript">
          <Text variant="body">{entry.transcript.text}</Text>
        </Card>
      )}

      <Button
        label="Delete entry"
        variant="ghost"
        onPress={async () => {
          await services?.journal.delete(entry.id);
          router.back();
        }}
      />
    </Screen>
  );
}

function AudioPlayback({ uri }: { uri: string }) {
  const theme = useTheme();
  // The hook creates the player and releases it on unmount.
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);

  const toggle = useCallback(() => {
    if (status.playing) {
      player.pause();
      return;
    }
    // Restart once playback has reached the end.
    if (status.didJustFinish) void player.seekTo(0);
    player.play();
  }, [player, status.playing, status.didJustFinish]);

  return (
    <Card>
      <View style={styles.playRow}>
        <Button
          label={status.playing ? 'Pause' : 'Play'}
          variant="secondary"
          fullWidth={false}
          onPress={toggle}
          disabled={!status.isLoaded}
        />
        <Text variant="caption" tone="muted">
          {formatDuration(status.currentTime * 1000)}
          {status.duration > 0 ? ` / ${formatDuration(status.duration * 1000)}` : ''}
        </Text>
      </View>
      <View
        style={[styles.progressTrack, { backgroundColor: theme.colors.surfaceSunken }]}
        accessibilityElementsHidden>
        <View
          style={{
            width: status.duration > 0 ? `${(status.currentTime / status.duration) * 100}%` : '0%',
            height: '100%',
            backgroundColor: theme.colors.accent,
          }}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  playRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
});
