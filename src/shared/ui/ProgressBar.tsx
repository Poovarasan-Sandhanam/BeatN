import { StyleSheet, View } from 'react-native';

import { useTheme } from '../theme';

export interface ProgressBarProps {
  /** 0..1. Values outside the range are clamped. */
  progress: number;
  /** Describes what is progressing, for screen readers. */
  label: string;
  tone?: 'accent' | 'recording';
}

export function ProgressBar({ progress, label, tone = 'accent' }: ProgressBarProps) {
  const theme = useTheme();
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const percent = Math.round(clamped * 100);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={[styles.track, { backgroundColor: theme.colors.surfaceSunken }]}>
      <View
        style={[
          styles.fill,
          {
            width: `${percent}%`,
            backgroundColor: tone === 'recording' ? theme.colors.recording : theme.colors.accent,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
});
