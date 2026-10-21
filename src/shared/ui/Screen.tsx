import { ScrollView, StyleSheet, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme';

export interface ScreenProps extends ViewProps {
  /** Wrap content in a ScrollView. Off for screens that must not scroll. */
  scroll?: boolean;
  /** Centre content vertically — used by onboarding and empty states. */
  centred?: boolean;
  /**
   * Pad for the notch and home indicator. Off when a native header already
   * occupies the top of the screen.
   */
  safeArea?: boolean;
}

export function Screen({
  scroll = true,
  centred = false,
  safeArea = true,
  children,
  style,
  ...rest
}: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const content = {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: (safeArea ? insets.top : 0) + theme.spacing.lg,
    paddingBottom: (safeArea ? insets.bottom : 0) + theme.spacing.xl,
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
      showsVerticalScrollIndicator={false}
      {...rest}>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
