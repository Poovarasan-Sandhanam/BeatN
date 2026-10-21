import { StyleSheet, View } from 'react-native';

import { useTheme } from '../theme';
import { Text } from './Text';

export interface ChipProps {
  label: string;
  /** A small coloured dot before the label — mood, status. */
  dot?: string;
  tone?: 'neutral' | 'accent' | 'danger';
}

/** Compact metadata. Never tappable — chips that look like buttons but are not erode trust. */
export function Chip({ label, dot, tone = 'neutral' }: ChipProps) {
  const theme = useTheme();
  const palette = {
    neutral: { bg: theme.colors.surfaceSunken, fg: 'muted' as const },
    accent: { bg: theme.colors.accentSoft, fg: 'accent' as const },
    danger: { bg: theme.colors.dangerSoft, fg: 'danger' as const },
  }[tone];

  return (
    <View style={[styles.chip, { backgroundColor: palette.bg, borderRadius: theme.radius.pill }]}>
      {dot !== undefined && <View style={[styles.dot, { backgroundColor: dot }]} />}
      <Text variant="captionStrong" tone={palette.fg} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
