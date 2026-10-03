import { StyleSheet, View, type ViewProps } from 'react-native';

import { useTheme } from '../theme';
import { Text } from './Text';

export interface CardProps extends ViewProps {
  /** Optional eyebrow heading above the content. */
  title?: string;
}

export function Card({ title, children, style, ...rest }: CardProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
          padding: theme.spacing.lg,
          gap: theme.spacing.md,
        },
        style,
      ]}
      {...rest}>
      {title !== undefined && (
        <Text variant="label" tone="muted">
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
