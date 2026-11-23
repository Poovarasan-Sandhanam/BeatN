import { Pressable, StyleSheet, View } from 'react-native';

import { dayKey, type DayKey } from '../../domain/insights/periodInsights';
import { MIN_TAP_TARGET, useTheme } from '../../shared/theme';
import { IconButton, Text } from '../../shared/ui';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export interface DayCalendarProps {
  /** First day of the month on show. */
  month: Date;
  selected: ReadonlySet<DayKey>;
  /** Days that have at least one entry — marked so they are easy to find. */
  withEntries: ReadonlySet<DayKey>;
  onToggle: (day: DayKey) => void;
  onMonthChange: (month: Date) => void;
  /** Passed in rather than read during render, so renders stay pure. */
  now: number;
}

/** A month grid for choosing any combination of days. Weeks start on Monday. */
export function DayCalendar({ month, selected, withEntries, onToggle, onMonthChange, now }: DayCalendarProps) {
  const theme = useTheme();
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  // getDay(): 0 = Sunday. Shift so Monday is the first column.
  const leadingBlanks = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const today = dayKey(now);
  const isCurrentMonth = year === new Date(now).getFullYear() && monthIndex === new Date(now).getMonth();

  const cells: (DayKey | null)[] = [
    ...Array<null>(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => dayKey(new Date(year, monthIndex, i + 1, 12).getTime())),
  ];

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={styles.header}>
        <IconButton
          icon="back"
          accessibilityLabel="Previous month"
          onPress={() => onMonthChange(new Date(year, monthIndex - 1, 1))}
        />
        <Text variant="heading">
          {month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
        </Text>
        <View style={{ transform: [{ scaleX: -1 }], opacity: isCurrentMonth ? 0.3 : 1 }}>
          <IconButton
            icon="back"
            accessibilityLabel="Next month"
            disabled={isCurrentMonth}
            onPress={() => onMonthChange(new Date(year, monthIndex + 1, 1))}
          />
        </View>
      </View>

      <View style={styles.grid}>
        {WEEKDAYS.map((label, i) => (
          <View key={`h${i}`} style={styles.cell}>
            <Text variant="captionStrong" tone="faint">
              {label}
            </Text>
          </View>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <View key={`b${i}`} style={styles.cell} />;
          const isSelected = selected.has(day);
          const isFuture = day > today;
          const hasEntries = withEntries.has(day);
          return (
            <Pressable
              key={day}
              disabled={isFuture}
              onPress={() => onToggle(day)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected, disabled: isFuture }}
              accessibilityLabel={`${new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}${hasEntries ? ', has entries' : ''}`}
              style={styles.cell}>
              <View
                style={[
                  styles.day,
                  {
                    backgroundColor: isSelected ? theme.colors.accent : 'transparent',
                    borderColor: day === today && !isSelected ? theme.colors.accent : 'transparent',
                  },
                ]}>
                <Text
                  variant="body"
                  style={{
                    color: isSelected ? theme.colors.onAccent : isFuture ? theme.colors.inkFaint : theme.colors.ink,
                  }}>
                  {Number(day.slice(8))}
                </Text>
              </View>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: hasEntries ? (isSelected ? theme.colors.accent : theme.colors.inkMuted) : 'transparent' },
                ]}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, minHeight: MIN_TAP_TARGET, alignItems: 'center', justifyContent: 'center', gap: 2 },
  day: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 4, height: 4, borderRadius: 2 },
});
