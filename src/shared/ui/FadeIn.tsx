import { useEffect, useState, type ReactNode } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';

export interface FadeInProps {
  children: ReactNode;
  /** Milliseconds before the entrance starts — use for staggering lists. */
  delay?: number;
  /** Distance the content rises while fading in. */
  offset?: number;
  style?: StyleProp<ViewStyle>;
}

/** Content arrives instead of appearing. Plays once, on mount. */
export function FadeIn({ children, delay = 0, offset = 12, style }: FadeInProps) {
  const theme = useTheme();
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: theme.motion.slow,
      delay,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, delay, theme.motion.slow]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] }) },
          ],
        },
      ]}>
      {children}
    </Animated.View>
  );
}
