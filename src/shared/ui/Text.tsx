import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useTheme } from '../theme';
import type { TypeVariant } from '../theme';

export interface TextProps extends RNTextProps {
  variant?: TypeVariant;
  /** Semantic colour role rather than a raw hex, so dark mode stays coherent. */
  tone?: 'default' | 'muted' | 'faint' | 'accent' | 'danger' | 'success' | 'onAccent';
  align?: TextStyle['textAlign'];
}

export function Text({
  variant = 'body',
  tone = 'default',
  align,
  style,
  ...rest
}: TextProps) {
  const theme = useTheme();

  const color = {
    default: theme.colors.ink,
    muted: theme.colors.inkMuted,
    faint: theme.colors.inkFaint,
    accent: theme.colors.accent,
    danger: theme.colors.danger,
    success: theme.colors.success,
    onAccent: theme.colors.onAccent,
  }[tone];

  return (
    <RNText
      style={[theme.typography[variant] as TextStyle, { color, textAlign: align }, style]}
      {...rest}
    />
  );
}
