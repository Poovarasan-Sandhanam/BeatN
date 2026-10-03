import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type ViewStyle,
} from 'react-native';

import { MIN_TAP_TARGET, useTheme } from '../theme';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'medium' | 'large' | 'hero';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Secondary line inside the button — e.g. a download size. */
  caption?: string;
  fullWidth?: boolean;
  style?: ViewStyle;
}

export function Button({
  label,
  caption,
  variant = 'primary',
  size = 'medium',
  loading = false,
  disabled = false,
  fullWidth = true,
  style,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const padding = {
    medium: { paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.lg },
    large: { paddingVertical: theme.spacing.lg, paddingHorizontal: theme.spacing.xl },
    hero: { paddingVertical: theme.spacing.xl, paddingHorizontal: theme.spacing.xl },
  }[size];

  const surfaces: Record<ButtonVariant, { bg: string; pressed: string; border?: string }> = {
    primary: { bg: theme.colors.accent, pressed: theme.colors.accentPressed },
    secondary: {
      bg: theme.colors.surface,
      pressed: theme.colors.surfaceSunken,
      border: theme.colors.border,
    },
    ghost: { bg: 'transparent', pressed: theme.colors.surfaceSunken },
    destructive: { bg: theme.colors.recording, pressed: theme.colors.danger },
  };
  const surface = surfaces[variant];
  const tone = variant === 'primary' || variant === 'destructive' ? 'onAccent' : 'default';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        padding,
        {
          backgroundColor: pressed && !isDisabled ? surface.pressed : surface.bg,
          borderRadius: size === 'hero' ? theme.radius.xl : theme.radius.md,
          borderWidth: surface.border ? StyleSheet.hairlineWidth : 0,
          borderColor: surface.border,
          opacity: isDisabled ? 0.45 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
      {...rest}>
      <View style={styles.content}>
        {loading && (
          <ActivityIndicator
            size="small"
            color={tone === 'onAccent' ? theme.colors.onAccent : theme.colors.accent}
          />
        )}
        <View>
          <Text variant={size === 'hero' ? 'heading' : 'bodyStrong'} tone={tone} align="center">
            {label}
          </Text>
          {caption !== undefined && (
            <Text variant="caption" tone={tone} align="center" style={{ opacity: 0.8 }}>
              {caption}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: MIN_TAP_TARGET, justifyContent: 'center' },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
});
