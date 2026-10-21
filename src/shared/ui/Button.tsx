import { ActivityIndicator, StyleSheet, View, type PressableProps, type ViewStyle } from 'react-native';

import { MIN_TAP_TARGET, useTheme } from '../theme';
import { Glyph, type GlyphName } from './Glyph';
import { PressableScale } from './PressableScale';
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
  /** Leading icon. */
  icon?: GlyphName;
  fullWidth?: boolean;
  style?: ViewStyle;
}

export function Button({
  label,
  caption,
  icon,
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

  const surfaces: Record<ButtonVariant, { bg: string; pressed: string; border?: string; fg: string }> = {
    primary: { bg: theme.colors.accent, pressed: theme.colors.accentPressed, fg: theme.colors.onAccent },
    secondary: {
      bg: theme.colors.surface,
      pressed: theme.colors.surfaceSunken,
      border: theme.colors.border,
      fg: theme.colors.ink,
    },
    ghost: { bg: 'transparent', pressed: theme.colors.surfaceSunken, fg: theme.colors.ink },
    destructive: { bg: theme.colors.recording, pressed: theme.colors.danger, fg: '#FFFFFF' },
  };
  const surface = surfaces[variant];
  const raised = variant === 'primary' || variant === 'destructive';

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        padding,
        {
          backgroundColor: pressed && !isDisabled ? surface.pressed : surface.bg,
          borderRadius: theme.radius.pill,
          borderWidth: surface.border ? StyleSheet.hairlineWidth : 0,
          borderColor: surface.border,
          opacity: isDisabled && !loading ? 0.45 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          boxShadow: raised && !isDisabled ? `0 6px 18px ${theme.colors.shadow}` : undefined,
        },
        style,
      ]}
      {...rest}>
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color={surface.fg} />
        ) : (
          icon !== undefined && <Glyph name={icon} color={surface.fg} size={size === 'medium' ? 16 : 20} />
        )}
        <View>
          <Text
            variant={size === 'hero' ? 'heading' : 'bodyStrong'}
            align="center"
            style={{ color: surface.fg }}>
            {label}
          </Text>
          {caption !== undefined && (
            <Text variant="caption" align="center" style={{ color: surface.fg, opacity: 0.75 }}>
              {caption}
            </Text>
          )}
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: MIN_TAP_TARGET, justifyContent: 'center' },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
});
