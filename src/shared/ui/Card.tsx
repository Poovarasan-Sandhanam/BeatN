import { StyleSheet, View, type ViewProps } from 'react-native';

import { useTheme } from '../theme';
import { Text } from './Text';

export interface CardProps extends ViewProps {
  /** Optional eyebrow heading above the content. */
  title?: string;
  /**
   * `raised` floats on the page with a soft shadow; `tinted` sits in the
   * accent wash for content the app generated; `flat` is for dense tools.
   */
  variant?: 'raised' | 'tinted' | 'flat';
}

export function Card({ title, variant = 'raised', children, style, ...rest }: CardProps) {
  const theme = useTheme();

  const look = {
    raised: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      boxShadow: `0 2px 12px ${theme.colors.shadow}`,
    },
    tinted: { backgroundColor: theme.colors.accentSoft, borderColor: 'transparent' },
    flat: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
  }[variant];

  return (
    <View
      style={[
        styles.card,
        look,
        {
          borderRadius: theme.radius.lg,
          padding: theme.spacing.lg,
          gap: theme.spacing.md,
        },
        style,
      ]}
      {...rest}>
      {title !== undefined && (
        <Text variant="label" tone={variant === 'tinted' ? 'accent' : 'muted'}>
          {title}
        </Text>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth },
});
