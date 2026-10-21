import { useState } from 'react';
import { Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  /** How far the element sinks while held. Subtle by default. */
  pressedScale?: number;
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
}

/**
 * A Pressable that physically gives under your thumb.
 *
 * Opacity flashes read as "web page"; a small spring scale reads as "object".
 * Runs on the native driver, so it stays smooth while the JS thread is busy
 * feeding audio to disk.
 */
export function PressableScale({
  pressedScale = 0.97,
  onPressIn,
  onPressOut,
  disabled,
  style,
  children,
  ...rest
}: PressableScaleProps) {
  const [scale] = useState(() => new Animated.Value(1));

  const springTo = (toValue: number) =>
    Animated.spring(scale, { toValue, useNativeDriver: true, speed: 40, bounciness: 6 }).start();

  return (
    <Pressable
      disabled={disabled}
      onPressIn={(event) => {
        springTo(pressedScale);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        springTo(1);
        onPressOut?.(event);
      }}
      {...rest}>
      {(state) => (
        <Animated.View
          style={[typeof style === 'function' ? style(state) : style, { transform: [{ scale }] }]}>
          {typeof children === 'function' ? children(state) : children}
        </Animated.View>
      )}
    </Pressable>
  );
}
