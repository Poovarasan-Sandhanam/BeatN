import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Animated, Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { JournalEntry } from '../../domain/entry/JournalEntry';
import { useServices } from '../../services/ServiceProvider';
import { formatDuration } from '../../shared/format';
import { useTheme } from '../../shared/theme';
import { Button, Chip, FadeIn, Glyph, PressableScale, Skeleton, Text } from '../../shared/ui';
import { describeStatus, formatClockTime, formatEntryDate, previewOf } from './entryStatus';
import { computeInsights, formatLongDate, greetingFor, groupByDay } from './journalInsights';
import { moodLook } from './mood';

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const services = useServices();
  const insets = useSafeAreaInsets();

  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // `isCancelled` lets the effect drop a result that arrived after unmount.
  const load = useCallback(
    async (isCancelled: () => boolean = () => false) => {
      if (!services) return;
      const next = await services.journal.list();
      if (!isCancelled()) setEntries(next);
    },
    [services],
  );

  // `revision` ticks whenever a job settles, so the list reflects background
  // progress without polling the database.
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const sections = useMemo(() => groupByDay(entries ?? []), [entries]);
  const insights = useMemo(() => computeInsights(entries ?? []), [entries]);
  const record = useCallback(() => router.push('/record'), [router]);

  const header = (
    <View style={{ gap: theme.spacing.xs, paddingTop: insets.top + theme.spacing.lg }}>
      <Text variant="label" tone="faint">
        {formatLongDate()}
      </Text>
      {/* Long-press is the way into developer tools: discoverable if you
          know, invisible if you do not. */}
      <Pressable onLongPress={() => router.push('/dev')} delayLongPress={800} accessibilityRole="header">
        <Text variant="hero">{greetingFor()}</Text>
      </Pressable>
    </View>
  );

  if (!services || entries === null) {
    return (
      <View style={[styles.fill, { backgroundColor: theme.colors.background, paddingHorizontal: theme.spacing.xl }]}>
        {header}
        <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.xxl }} accessibilityLabel="Opening your journal">
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={{
                gap: theme.spacing.sm,
                padding: theme.spacing.lg,
                borderRadius: theme.radius.lg,
                backgroundColor: theme.colors.surface,
              }}>
              <Skeleton width="40%" height={12} />
              <Skeleton height={16} />
              <Skeleton width="75%" height={16} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (entries.length === 0) {
    return <EmptyJournal header={header} onRecord={record} />;
  }

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.background }]}>
      <SectionList
        sections={sections}
        keyExtractor={(entry) => entry.id}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.xl,
          paddingBottom: insets.bottom + 120,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.inkFaint} />
        }
        ListHeaderComponent={
          <View style={{ gap: theme.spacing.xl, marginBottom: theme.spacing.sm }}>
            {header}
            <FadeIn delay={60}>
              <View style={[styles.stats, { gap: theme.spacing.sm }]}>
                <StatTile value={insights.streakDays} label="day streak" />
                <StatTile value={insights.thisWeek} label="this week" />
                <StatTile value={insights.totalMinutes} label={insights.totalMinutes === 1 ? 'minute' : 'minutes'} />
              </View>
            </FadeIn>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text
            variant="label"
            tone="muted"
            style={{ marginTop: theme.spacing.xl, marginBottom: theme.spacing.md }}
            accessibilityRole="header">
            {section.title}
          </Text>
        )}
        ItemSeparatorComponent={() => <View style={{ height: theme.spacing.md }} />}
        renderItem={({ item, index, section }) => (
          <FadeIn delay={Math.min(sections.indexOf(section) * 3 + index, 8) * theme.motion.stagger + 100}>
            <EntryCard entry={item} onPress={() => router.push(`/entry/${item.id}`)} />
          </FadeIn>
        )}
      />

      <View
        pointerEvents="box-none"
        style={[styles.dock, { paddingBottom: insets.bottom + theme.spacing.lg }]}>
        <RecordFab onPress={record} />
      </View>
    </View>
  );
}

function StatTile({ value, label }: { value: number; label: string }) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${value} ${label}`}
      style={[
        styles.stat,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          padding: theme.spacing.md,
        },
      ]}>
      <Text variant="numeric">{value}</Text>
      <Text variant="caption" tone="muted" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function EntryCard({ entry, onPress }: { entry: JournalEntry; onPress: () => void }) {
  const theme = useTheme();
  const status = describeStatus(entry.processingState);
  const preview = previewOf(entry);
  const title = entry.reflection?.title?.trim();
  const mood = entry.mood && entry.mood.value !== 'unknown' ? moodLook(entry.mood.value, theme.isDark) : null;

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${formatEntryDate(entry.createdAt)} at ${formatClockTime(entry.createdAt)}. ${title ?? ''} ${status.label}`}
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
          padding: theme.spacing.lg,
          gap: theme.spacing.sm,
          boxShadow: `0 2px 10px ${theme.colors.shadow}`,
        },
      ]}>
      <View style={styles.row}>
        <Text variant="captionStrong" tone="muted">
          {formatClockTime(entry.createdAt)}
        </Text>
        <Text variant="caption" tone="faint">
          {formatDuration(entry.audio.durationMs)}
        </Text>
      </View>

      {title ? (
        <Text variant="title" numberOfLines={2}>
          {title}
        </Text>
      ) : null}

      {preview ? (
        <Text variant={title ? 'body' : 'reading'} tone={title ? 'muted' : 'default'} numberOfLines={3}>
          {preview}
        </Text>
      ) : (
        <Text variant="reading" tone="faint">
          Listening back to what you said…
        </Text>
      )}

      {(status.busy || entry.processingState === 'failed' || mood || entry.topics.length > 0) && (
        <View style={[styles.chips, { marginTop: theme.spacing.xs }]}>
          {status.busy && <BusyChip label={status.label} />}
          {entry.processingState === 'failed' && <Chip label={status.label} tone="danger" />}
          {mood && <Chip label={mood.label} dot={mood.color} />}
          {!status.busy &&
            entry.topics.slice(0, 2).map((topic) => <Chip key={topic.name} label={topic.name} />)}
        </View>
      )}
    </PressableScale>
  );
}

/** A chip with a breathing dot: work is happening, nothing is wrong. */
function BusyChip({ label }: { label: string }) {
  const theme = useTheme();
  const [pulse] = useState(() => new Animated.Value(0.35));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={[styles.busyChip, { backgroundColor: theme.colors.accentSoft, borderRadius: theme.radius.pill }]}>
      <Animated.View style={[styles.busyDot, { backgroundColor: theme.colors.accent, opacity: pulse }]} />
      <Text variant="captionStrong" tone="accent">
        {label}
      </Text>
    </View>
  );
}

function RecordFab({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="New entry"
      accessibilityHint="Opens the recorder"
      pressedScale={0.94}
      style={[
        styles.fab,
        {
          backgroundColor: theme.colors.ink,
          borderRadius: theme.radius.pill,
          boxShadow: `0 10px 30px ${theme.colors.shadow}`,
        },
      ]}>
      <View style={[styles.fabIcon, { backgroundColor: theme.colors.recording }]}>
        <Glyph name="mic" color="#FFFFFF" size={18} />
      </View>
      <Text variant="bodyStrong" style={{ color: theme.colors.background }}>
        New entry
      </Text>
    </PressableScale>
  );
}

const PROMPTS = [
  'What took up most of your head today?',
  'One thing that went better than expected.',
  'Something you keep putting off — and why.',
];

function EmptyJournal({ header, onRecord }: { header: ReactNode; onRecord: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.fill,
        {
          backgroundColor: theme.colors.background,
          paddingHorizontal: theme.spacing.xl,
          paddingBottom: insets.bottom + theme.spacing.xl,
        },
      ]}>
      {header}
      <View style={[styles.fill, { justifyContent: 'center', gap: theme.spacing.xl }]}>
        <FadeIn style={{ alignItems: 'center' }}>
          <BreathingRings />
        </FadeIn>
        <FadeIn delay={120} style={{ gap: theme.spacing.sm }}>
          <Text variant="display" align="center">
            Say what’s on your mind.
          </Text>
          <Text variant="body" tone="muted" align="center">
            Talk for a minute. BeatN writes it down and reflects it back — without anything
            leaving this phone.
          </Text>
        </FadeIn>
        <FadeIn delay={220} style={{ gap: theme.spacing.sm }}>
          {PROMPTS.map((prompt) => (
            <View
              key={prompt}
              style={{
                paddingVertical: theme.spacing.md,
                paddingHorizontal: theme.spacing.lg,
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.surface,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: theme.colors.border,
              }}>
              <Text variant="body" tone="muted" style={{ fontStyle: 'italic' }}>
                “{prompt}”
              </Text>
            </View>
          ))}
        </FadeIn>
      </View>
      <FadeIn delay={320}>
        <Button label="Record your first entry" icon="mic" size="large" onPress={onRecord} />
      </FadeIn>
    </View>
  );
}

/** Slow concentric pulse around the mic — an invitation, not an alarm. */
function BreathingRings() {
  const theme = useTheme();
  const [breath] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 2400, useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: 2400, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breath]);

  const ring = (size: number, from: number, to: number) => (
    <Animated.View
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: theme.colors.accentSoft,
        opacity: breath.interpolate({ inputRange: [0, 1], outputRange: [from, to] }),
        transform: [{ scale: breath.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.04] }) }],
      }}
    />
  );

  return (
    <View style={styles.rings} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {ring(150, 0.35, 0.7)}
      {ring(108, 0.7, 1)}
      <View style={[styles.ringCore, { backgroundColor: theme.colors.accent }]}>
        <Glyph name="mic" color={theme.colors.onAccent} size={28} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  card: { borderWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stats: { flexDirection: 'row' },
  stat: { flex: 1, borderWidth: StyleSheet.hairlineWidth, gap: 2 },
  busyChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4 },
  busyDot: { width: 7, height: 7, borderRadius: 4 },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 8,
    paddingRight: 24,
    paddingVertical: 8,
  },
  fabIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rings: { width: 150, height: 150, alignItems: 'center', justifyContent: 'center' },
  ringCore: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
});
