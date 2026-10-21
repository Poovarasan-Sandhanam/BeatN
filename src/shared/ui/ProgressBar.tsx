import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useTheme } from '../theme';

export interface ProgressBarProps {
  /** 0..1. Values outside the range are clamped. */
  progress: number;
  /** Describes what is progressing, for screen readers. */
  label: string;
  tone?: 'accent' | 'recording';
  height?: number;
}

export function ProgressBar({ progress, label, tone = 'accent', height = 8 }: ProgressBarProps) {
  const theme = useTheme();
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const percent = Math.round(clamped * 100);

  // Download progress arrives in bursts; easing between ticks makes it glide.
  // Width cannot use the native driver, but this is one view at a few Hz.
  const [animated] = useState(() => new Animated.Value(clamped));
  useEffect(() => {
    Animated.timing(animated, {
      toValue: clamped,
      duration: theme.motion.base,
      useNativeDriver: false,
    }).start();
  }, [animated, clamped, theme.motion.base]);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={[
        styles.track,
        { height, borderRadius: height / 2, backgroundColor: theme.colors.surfaceSunken },
      ]}>
      <Animated.View
        style={{
          height: '100%',
          borderRadius: height / 2,
          width: animated.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          backgroundColor: tone === 'recording' ? theme.colors.recording : theme.colors.accent,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { overflow: 'hidden' },
});
