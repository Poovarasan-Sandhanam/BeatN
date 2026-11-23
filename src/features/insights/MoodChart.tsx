import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Mood } from '../../domain/entry/JournalEntry';
import { useTheme } from '../../shared/theme';
import { Text } from '../../shared/ui';
import { moodLook } from '../home/mood';

/**
 * Diverging pair, validated with the dataviz palette checker in both modes
 * (lightness band, chroma, colour-blind separation, contrast on the surface).
 * Warm for brighter, cool for heavier — deliberately not red, which would
 * read as alarm and is the app's recording colour.
 */
const POLES = {
  light: { bright: '#B8862A', heavy: '#3F5FC0', neutral: '#B8B2A8' },
  dark: { bright: '#B07F22', heavy: '#6F8CEB', neutral: '#5A5650' },
};
/** |valence| below this reads as neither side: a grey stub, not a coloured bar. */
const NEUTRAL_BAND = 0.1;
const HALF_HEIGHT = 40;
/** Bars never get fatter than this, so one or two points do not become slabs. */
const MAX_BAR_WIDTH = 22;

export interface ChartPoint {
  key: string;
  /** Says what the bar is: "Mon 23 Nov" for a day, "13:28" for an entry. */
  label: string;
  valence: number | null;
  mood: Mood | null;
  /** Entries behind the point; 0 marks an empty day. */
  entries: number;
}

/**
 * Mood across the period: one bar per point, up for brighter, down for
 * heavier, length for how far. Direction is in position and in the axis
 * labels, so colour never carries meaning alone. Tap a bar for details.
 */
export function MoodChart({ points, unit }: { points: ChartPoint[]; unit: 'day' | 'entry' }) {
  const theme = useTheme();
  const poles = theme.isDark ? POLES.dark : POLES.light;
  const [selected, setSelected] = useState<string | null>(null);
  const chosen = points.find((p) => p.key === selected) ?? null;
  const gap = points.length > 45 ? 1 : 3;

  const describe = (point: ChartPoint) => {
    if (point.entries === 0) return `${point.label} · no entries`;
    const mood = point.mood && point.mood !== 'unknown' ? moodLook(point.mood, theme.isDark).label : 'mood unclear';
    return unit === 'day'
      ? `${point.label} · ${mood} · ${point.entries} ${point.entries === 1 ? 'entry' : 'entries'}`
      : `${point.label} · ${mood}`;
  };

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={styles.row}>
        <View style={styles.axis}>
          <Text variant="caption" tone="faint">
            Brighter
          </Text>
          <Text variant="caption" tone="faint">
            Heavier
          </Text>
        </View>
        <View style={[styles.plot, { gap }]}>
          {points.map((point) => {
            const v = point.valence;
            const isSelected = point.key === selected;
            const dimmed = selected !== null && !isSelected;
            const color =
              v === null ? 'transparent' : Math.abs(v) < NEUTRAL_BAND ? poles.neutral : v > 0 ? poles.bright : poles.heavy;
            const height = v === null ? 0 : Math.max(4, Math.abs(v) * HALF_HEIGHT);
            const bar = { height, backgroundColor: color, opacity: dimmed ? 0.3 : 1 };
            return (
              <Pressable
                key={point.key}
                onPress={() => setSelected(isSelected ? null : point.key)}
                accessibilityRole="button"
                accessibilityLabel={describe(point)}
                hitSlop={{ top: 10, bottom: 10 }}
                style={[styles.column, { maxWidth: MAX_BAR_WIDTH }]}>
                <View style={styles.half}>{v !== null && v >= 0 && <View style={[styles.barUp, bar]} />}</View>
                <View style={[styles.baseline, { backgroundColor: theme.colors.border }]}>
                  {point.entries === 0 && <View style={[styles.empty, { backgroundColor: theme.colors.border }]} />}
                </View>
                <View style={[styles.half, styles.halfDown]}>{v !== null && v < 0 && <View style={[styles.barDown, bar]} />}</View>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Text variant="caption" tone={chosen ? 'default' : 'faint'} align="center">
        {chosen ? describe(chosen) : unit === 'day' ? 'Tap a day for details' : 'Each bar is one entry · tap for details'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  axis: { justifyContent: 'space-between', paddingVertical: 2 },
  // Bars sit from the right, so a short period reads as "recent", not a lonely bar mid-chart.
  plot: { flex: 1, flexDirection: 'row', alignItems: 'stretch', justifyContent: 'flex-end' },
  column: { flex: 1, alignItems: 'stretch' },
  half: { height: HALF_HEIGHT, justifyContent: 'flex-end' },
  halfDown: { justifyContent: 'flex-start' },
  // Rounded at the data end only, anchored flat to the baseline.
  barUp: { width: '100%', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  barDown: { width: '100%', borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  baseline: { height: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { width: 3, height: 3, borderRadius: 2 },
});
