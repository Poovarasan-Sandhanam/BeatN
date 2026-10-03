import { ScrollView, StyleSheet, View, type ViewProps } from 'react-native';

import { useTheme } from '../theme';

export interface ScreenProps extends ViewProps {
  /** Wrap content in a ScrollView. Off for screens that must not scroll. */
  scroll?: boolean;
  /** Centre content vertically — used by onboarding and empty states. */
  centred?: boolean;
}

export function Screen({ scroll = true, centred = false, children, style, ...rest }: ScreenProps) {
  const theme = useTheme();

  const content = {
    padding: theme.spacing.xl,
    gap: theme.spacing.lg,
    flexGrow: 1,
    justifyContent: centred ? ('center' as const) : undefined,
  };

  if (!scroll) {
    return (
      <View style={[styles.fill, { backgroundColor: theme.colors.background }, content, style]} {...rest}>
        {children}
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.fill, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={[content, style]}
      keyboardShouldPersistTaps="handled"
      {...rest}>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
