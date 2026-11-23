import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PeriodReflection } from '../../core/ai/periodReflection';
import type { Mood } from '../../domain/entry/JournalEntry';
import {
  WEEKDAY_NAMES,
  dayKey,
  type DayKey,
  type PeriodStats,
  type Trend,
} from '../../domain/insights/periodInsights';
import type { PeriodData } from '../../services/InsightsService';
import { useServices } from '../../services/ServiceProvider';
import { describeError } from '../../shared/errors';
import { useTheme } from '../../shared/theme';
import { Button, Card, Chip, FadeIn, IconButton, PressableScale, Skeleton, Text } from '../../shared/ui';
import { moodLook } from '../home/mood';
import { DayCalendar } from './DayCalendar';
import { MoodChart, type ChartPoint } from './MoodChart';
import { PERIOD_PRESETS, describeSelection } from './periodPresets';

const TREND_TEXT: Record<Trend, string> = {
  improving: 'Getting brighter across these days',
  steady: 'Fairly steady across these days',
  declining: 'Getting heavier across these days',
  unclear: 'Record on a few more days to see which way things are going',
};

export default function InsightsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const services = useServices();
  const insets = useSafeAreaInsets();

  // "Today" for this visit, fixed when the screen opens so renders stay pure.
  const [now] = useState(() => Date.now());
  const [presetId, setPresetId] = useState<string | null>('7d');
  const [picked, setPicked] = useState<DayKey[]>([]);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [monthEntryDays, setMonthEntryDays] = useState<Set<DayKey>>(new Set());

  const [data, setData] = useState<PeriodData | null>(null);
  const [reflection, setReflection] = useState<PeriodReflection | null>(null);
  const [reflecting, setReflecting] = useState(false);
  const [reflectError, setReflectError] = useState('');

  const days = useMemo(() => {
    const preset = PERIOD_PRESETS.find((p) => p.id === presetId);
    return preset ? preset.days(now) : [...picked].sort();
  }, [presetId, picked, now]);
  const selectionKey = days.join(',');
  const label = describeSelection(days, presetId);

  // Numbers for the chosen days. Cheap, so recomputed on every change.
  useEffect(() => {
    if (!services) return;
    let cancelled = false;
    void services.insights.periodData(days).then((next) => {
      if (cancelled) return;
      setData(next);
      setReflection(null);
      setReflectError('');
    });
    return () => {
      cancelled = true;
    };
    // `days` is a fresh array each render; its contents are `selectionKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, selectionKey, services?.revision]);

  // Dots on the calendar: which days of the visible month have entries.
  useEffect(() => {
    if (!services || presetId !== null) return;
    let cancelled = false;
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const monthDays = Array.from({ length: count }, (_, i) =>
      dayKey(new Date(month.getFullYear(), month.getMonth(), i + 1, 12).getTime()),
    );
    void services.insights.periodData(monthDays).then((next) => {
      if (!cancelled) setMonthEntryDays(new Set(next.stats.daily.filter((d) => d.entries > 0).map((d) => d.day)));
    });
    return () => {
      cancelled = true;
    };
  }, [services, presetId, month]);

  const toggleDay = useCallback((day: DayKey) => {
    setPicked((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day]));
  }, []);

  const reflect = useCallback(async () => {
    if (!services || !data) return;
    setReflecting(true);
    setReflectError('');
    try {
      setReflection(await services.insights.reflect(data, label));
    } catch (error) {
      setReflectError(describeError(error));
    } finally {
      setReflecting(false);
    }
  }, [services, data, label]);

  const stats = data?.stats;

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.topBar, { paddingTop: insets.top + theme.spacing.sm, paddingHorizontal: theme.spacing.lg }]}>
        <IconButton icon="back" accessibilityLabel="Back" onPress={() => router.back()} />
        <Text variant="heading">Insights</Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.xl,
          paddingTop: theme.spacing.md,
          paddingBottom: insets.bottom + theme.spacing.xxxl,
          gap: theme.spacing.xl,
        }}>
        <View style={{ gap: theme.spacing.md }}>
          {/* Wrapped, not a sideways scroller: "Pick days" must never hide off-screen. */}
          <View style={styles.choices}>
            {PERIOD_PRESETS.map((preset) => (
              <Choice
                key={preset.id}
                label={preset.label}
                selected={presetId === preset.id}
                onPress={() => setPresetId(preset.id)}
              />
            ))}
            <Choice label="Pick days…" selected={presetId === null} onPress={() => setPresetId(null)} />
          </View>

          {presetId === null && (
            <FadeIn>
              <Card variant="flat">
                <DayCalendar
                  month={month}
                  selected={new Set(picked)}
                  withEntries={monthEntryDays}
                  onToggle={toggleDay}
                  onMonthChange={setMonth}
                  now={now}
                />
                <View style={styles.pickRow}>
                  <Text variant="caption" tone="muted">
                    {picked.length === 0 ? 'Tap days to compare them — any combination.' : `${picked.length} chosen`}
                  </Text>
                  {picked.length > 0 && (
                    <PressableScale onPress={() => setPicked([])} accessibilityRole="button" hitSlop={12}>
                      <Text variant="captionStrong" tone="accent">
                        Clear
                      </Text>
                    </PressableScale>
                  )}
                </View>
              </Card>
            </FadeIn>
          )}
        </View>

        {!stats ? (
          <View style={{ gap: theme.spacing.md }}>
            <Skeleton height={80} radius={theme.radius.lg} />
            <Skeleton height={160} radius={theme.radius.lg} />
          </View>
        ) : stats.entryCount === 0 ? (
          <Card variant="flat">
            <Text variant="bodyStrong">{days.length === 0 ? 'Choose some days' : 'No entries in these days'}</Text>
            <Text variant="body" tone="muted">
              {days.length === 0
                ? 'Pick days on the calendar, or choose a period above.'
                : 'Record a few entries and come back — patterns appear after a handful.'}
            </Text>
          </Card>
        ) : (
          <>
            <FadeIn style={{ gap: theme.spacing.sm }}>
              <Text variant="label" tone="faint">
                {label}
              </Text>
              <View style={styles.tiles}>
                <Tile value={stats.entryCount} label={stats.entryCount === 1 ? 'entry' : 'entries'} />
                <Tile value={stats.daysWithEntries} label={`of ${stats.days.length} days`} />
                <Tile value={stats.totalMinutes} label="minutes" />
              </View>
            </FadeIn>

            <FadeIn delay={60}>
              <Card title="Mood over time" variant="raised">
                <MoodChart {...chartFor(stats)} />
                <Text variant="caption" tone={stats.trend === 'unclear' ? 'faint' : 'muted'}>
                  {TREND_TEXT[stats.trend]}.
                </Text>
              </Card>
            </FadeIn>

            <FadeIn delay={100}>
              <Card title="How you've been" variant="raised">
                {stats.dominantMood ? (
                  <Text variant="body">
                    Most often <Text variant="bodyStrong">{moodLook(stats.dominantMood, theme.isDark).label.toLowerCase()}</Text>.
                  </Text>
                ) : (
                  <Text variant="body" tone="muted">
                    No clear mood in these entries yet.
                  </Text>
                )}
                <View style={styles.chips}>
                  {(Object.entries(stats.moodCounts) as [Mood, number][])
                    .sort((a, b) => b[1] - a[1])
                    .map(([mood, count]) => {
                      const look = moodLook(mood, theme.isDark);
                      return <Chip key={mood} label={`${look.label} · ${count}`} dot={look.color} />;
                    })}
                </View>
                <EnergyLine counts={stats.energyCounts} />
              </Card>
            </FadeIn>

            {(stats.liftingTopics.length > 0 ||
              stats.heavyTopics.length > 0 ||
              stats.bestWeekday !== null) && (
              <FadeIn delay={140}>
                <Card title="What comes with your days" variant="raised">
                  {stats.liftingTopics.length > 0 && (
                    <TopicRow label="Brighter days often mention" topics={stats.liftingTopics.map((t) => t.name)} />
                  )}
                  {stats.heavyTopics.length > 0 && (
                    <TopicRow label="Heavier days often mention" topics={stats.heavyTopics.map((t) => t.name)} />
                  )}
                  {stats.bestWeekday !== null && stats.hardestWeekday !== null && (
                    <Text variant="body">
                      Brightest on {WEEKDAY_NAMES[stats.bestWeekday]}s, hardest on {WEEKDAY_NAMES[stats.hardestWeekday]}s.
                    </Text>
                  )}
                  <Text variant="caption" tone="faint">
                    Things that go together — not proof that one causes the other.
                  </Text>
                </Card>
              </FadeIn>
            )}

            <FadeIn delay={180} style={{ gap: theme.spacing.md }}>
              {reflection ? (
                <ReflectionCard reflection={reflection} />
              ) : (
                <Card variant="tinted">
                  <Text variant="bodyStrong">Reflect on these days</Text>
                  <Text variant="body" tone="muted">
                    BeatN reads your summaries and these numbers, then writes what stands out, a few small
                    things to try, and what may lie ahead. On this phone, usually within a minute.
                  </Text>
                  {reflectError !== '' && (
                    <Text variant="caption" tone="danger">
                      {reflectError}
                    </Text>
                  )}
                  <Button
                    label={reflecting ? 'Reflecting…' : 'Reflect'}
                    loading={reflecting}
                    onPress={reflect}
                  />
                </Card>
              )}
            </FadeIn>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.choice,
        {
          backgroundColor: selected ? theme.colors.ink : theme.colors.surface,
          borderColor: selected ? theme.colors.ink : theme.colors.border,
          borderRadius: theme.radius.pill,
        },
      ]}>
      <Text variant="captionStrong" style={{ color: selected ? theme.colors.background : theme.colors.ink }}>
        {label}
      </Text>
    </PressableScale>
  );
}

function Tile({ value, label }: { value: number; label: string }) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${value} ${label}`}
      style={[
        styles.tile,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.md },
      ]}>
      <Text variant="numeric">{value}</Text>
      <Text variant="caption" tone="muted" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Energy in the voice as one bar split three ways — an ordinal scale, so one
 * hue stepping from light (low) to dark (high), with the counts written out
 * beneath so the colour never has to be read on its own.
 */
function EnergyLine({ counts }: { counts: Record<'low' | 'typical' | 'high', number> }) {
  const theme = useTheme();
  const measured = counts.low + counts.typical + counts.high;
  if (measured === 0) return null;
  const steps = [
    { key: 'low', label: 'Low', count: counts.low, opacity: 0.35 },
    { key: 'typical', label: 'Steady', count: counts.typical, opacity: 0.65 },
    { key: 'high', label: 'High', count: counts.high, opacity: 1 },
  ];
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text variant="caption" tone="muted">
        Energy in your voice
      </Text>
      <View
        style={styles.energyBar}
        accessible
        accessibilityLabel={`Energy in your voice: ${steps.map((s) => `${s.count} ${s.label.toLowerCase()}`).join(', ')}`}>
        {steps
          .filter((step) => step.count > 0)
          .map((step) => (
            <View
              key={step.key}
              style={{ flex: step.count, backgroundColor: theme.colors.accent, opacity: step.opacity }}
            />
          ))}
      </View>
      <View style={styles.energyLegend}>
        {steps.map((step) => (
          <Text key={step.key} variant="caption" tone={step.count > 0 ? 'muted' : 'faint'}>
            {step.label} {step.count}
          </Text>
        ))}
      </View>
    </View>
  );
}

function TopicRow({ label, topics }: { label: string; topics: string[] }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <View style={styles.chips}>
        {topics.map((topic) => (
          <Chip key={topic} label={topic} />
        ))}
      </View>
    </View>
  );
}

function ReflectionCard({ reflection }: { reflection: PeriodReflection }) {
  const theme = useTheme();
  return (
    <Card title="Reflection" variant="tinted">
      <Text variant="reading">{reflection.overview}</Text>

      {reflection.patterns.length > 0 && (
        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="label" tone="accent">
            Patterns
          </Text>
          {reflection.patterns.map((pattern) => (
            <Text key={pattern} variant="body">
              • {pattern}
            </Text>
          ))}
        </View>
      )}

      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="label" tone="accent">
          Small things to try
        </Text>
        {reflection.suggestions.map((suggestion) => (
          <Text key={suggestion} variant="body">
            • {suggestion}
          </Text>
        ))}
      </View>

      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="label" tone="accent">
          Looking ahead
        </Text>
        <Text variant="body">{reflection.outlook}</Text>
      </View>

      <Text variant="caption" tone="faint">
        Written on this phone from your entries. BeatN is a journal, not a therapist.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  spacer: { width: 40 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { paddingHorizontal: 14, paddingVertical: 8, borderWidth: StyleSheet.hairlineWidth },
  pickRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  // A 2px surface gap between segments, per the chart spec.
  energyBar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 },
  energyLegend: { flexDirection: 'row', justifyContent: 'space-between' },
});

const dayName = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const clock = (at: number) => new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/**
 * Entry by entry for short or sparse periods (one bar per day would collapse
 * a busy day into a single slab); day by day once there is a span to show.
 */
function chartFor(stats: PeriodStats): { points: ChartPoint[]; unit: 'day' | 'entry' } {
  const byEntry = stats.days.length <= 3 || stats.daysWithEntries <= 2;
  if (byEntry) {
    const multiDay = new Set(stats.timeline.map((t) => dayKey(t.at))).size > 1;
    return {
      unit: 'entry',
      points: stats.timeline.map((t, i) => ({
        key: `${t.at}-${i}`,
        label: multiDay ? `${dayName(dayKey(t.at))}, ${clock(t.at)}` : clock(t.at),
        valence: t.valence,
        mood: t.mood,
        entries: 1,
      })),
    };
  }
  return {
    unit: 'day',
    points: stats.daily.map((d) => ({ key: d.day, label: dayName(d.day), valence: d.valence, mood: d.mood, entries: d.entries })),
  };
}
