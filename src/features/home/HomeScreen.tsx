import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import type { JournalEntry } from '../../domain/entry/JournalEntry';
import { useServices } from '../../services/ServiceProvider';
import { formatDuration } from '../../shared/format';
import { useTheme } from '../../shared/theme';
import { Button, Screen, Text } from '../../shared/ui';
import { describeStatus, formatClockTime, formatEntryDate, previewOf } from './entryStatus';

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const services = useServices();

  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!services) return;
    setEntries(await services.journal.list());
  }, [services]);

  // `revision` ticks whenever a job settles, so the list reflects background
  // progress without polling the database.
  useEffect(() => {
    void load();
  }, [load, services?.revision]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  if (!services || entries === null) {
    return (
      <Screen centred scroll={false}>
        <ActivityIndicator />
        <Text variant="caption" tone="muted" align="center">
          Opening your journal…
        </Text>
      </Screen>
    );
  }

  if (entries.length === 0) {
    return (
      <Screen centred scroll={false}>
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="display">Your journal is empty.</Text>
          <Text variant="body" tone="muted">
            Speak for a minute about your day. BeatN will transcribe it and reflect it back —
            entirely on this phone.
          </Text>
        </View>
        <Button label="Record your first entry" size="large" onPress={() => router.push('/record')} />
      </Screen>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.background }]}>
      <FlatList
        data={entries}
        keyExtractor={(entry) => entry.id}
        contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View style={{ gap: theme.spacing.xs, marginBottom: theme.spacing.sm }}>
            <Text variant="display">Journal</Text>
            <Text variant="caption" tone="muted">
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'} · stored only on this
              phone
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <EntryCard entry={item} onPress={() => router.push(`/entry/${item.id}`)} />
        )}
      />

      <View
        style={[
          styles.dock,
          { padding: theme.spacing.xl, backgroundColor: theme.colors.background },
        ]}>
        <Button label="Record" size="large" onPress={() => router.push('/record')} />
      </View>
    </View>
  );
}

function EntryCard({ entry, onPress }: { entry: JournalEntry; onPress: () => void }) {
  const theme = useTheme();
  const status = describeStatus(entry.processingState);
  const preview = previewOf(entry);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${formatEntryDate(entry.createdAt)} entry, ${status.label}`}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? theme.colors.surfaceSunken : theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
          padding: theme.spacing.lg,
          gap: theme.spacing.sm,
        },
      ]}>
      <View style={styles.row}>
        <Text variant="bodyStrong">{formatEntryDate(entry.createdAt)}</Text>
        <Text variant="caption" tone="faint">
          {formatClockTime(entry.createdAt)} · {formatDuration(entry.audio.durationMs)}
        </Text>
      </View>

      {preview ? (
        <Text variant="body" tone="muted" numberOfLines={2}>
          {preview}
        </Text>
      ) : (
        <Text variant="body" tone="faint">
          No transcript yet
        </Text>
      )}

      <View style={styles.row}>
        <View style={styles.statusRow}>
          {status.busy && <ActivityIndicator size="small" color={theme.colors.accent} />}
          <Text variant="caption" tone={status.tone === 'success' ? 'muted' : status.tone}>
            {status.label}
          </Text>
        </View>
        {entry.mood && (
          <Text variant="caption" tone="faint">
            {entry.mood.value}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  card: { borderWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dock: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'transparent' },
});
