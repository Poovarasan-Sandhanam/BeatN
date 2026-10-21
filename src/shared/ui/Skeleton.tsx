import { useEffect, useState } from 'react';
import { Animated, type DimensionValue } from 'react-native';

import { useTheme } from '../theme';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
}

/**
 * Placeholder shaped like the content that is coming.
 *
 * A spinner says "wait"; a skeleton says "here is roughly what you will see",
 * which makes the same wait feel shorter.
 */
export function Skeleton({ width = '100%', height = 14, radius }: SkeletonProps) {
  const theme = useTheme();
  const [pulse] = useState(() => new Animated.Value(0.5));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      accessibilityElementsHidden
      style={{
        width,
        height,
        borderRadius: radius ?? theme.radius.sm,
        backgroundColor: theme.colors.surfaceSunken,
        opacity: pulse,
      }}
    />
  );
}
