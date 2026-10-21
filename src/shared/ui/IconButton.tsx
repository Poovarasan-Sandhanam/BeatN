import { StyleSheet } from 'react-native';

import { MIN_TAP_TARGET, useTheme } from '../theme';
import { Glyph, type GlyphName } from './Glyph';
import { PressableScale } from './PressableScale';

export interface IconButtonProps {
  icon: GlyphName;
  /** Required: an icon alone says nothing to a screen reader. */
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
}

/** Round, quiet, top-bar control — close, back. */
export function IconButton({ icon, accessibilityLabel, onPress, disabled }: IconButtonProps) {
  const theme = useTheme();

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      pressedScale={0.9}
      style={[
        styles.button,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, opacity: disabled ? 0.4 : 1 },
      ]}>
      <Glyph name={icon} color={theme.colors.ink} size={16} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    width: MIN_TAP_TARGET - 4,
    height: MIN_TAP_TARGET - 4,
    borderRadius: MIN_TAP_TARGET,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
