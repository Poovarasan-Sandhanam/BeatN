import { lastDays, thisMonth, type DayKey } from '../../domain/insights/periodInsights';

export interface PeriodPreset {
  id: string;
  label: string;
  days: (now: number) => DayKey[];
}

/** Quick choices. "Pick days" (any combination on a calendar) sits beside these. */
export const PERIOD_PRESETS: PeriodPreset[] = [
  { id: '3d', label: '3 days', days: (now) => lastDays(3, now) },
  { id: '7d', label: 'Week', days: (now) => lastDays(7, now) },
  { id: 'month', label: 'This month', days: (now) => thisMonth(now) },
  { id: '30d', label: '30 days', days: (now) => lastDays(30, now) },
  { id: '90d', label: '3 months', days: (now) => lastDays(90, now) },
];

const PRESET_DESCRIPTIONS: Record<string, string> = {
  '3d': 'Last 3 days',
  '7d': 'Last 7 days',
  month: 'This month',
  '30d': 'Last 30 days',
  '90d': 'Last 3 months',
};

/** A label for the model and the screen: the preset's name, or a description of the picked days. */
export function describeSelection(days: readonly DayKey[], presetId: string | null): string {
  const preset = PERIOD_PRESETS.find((p) => p.id === presetId);
  if (preset) return PRESET_DESCRIPTIONS[preset.id] ?? preset.label;
  if (days.length === 1) return '1 chosen day';
  return `${days.length} chosen days`;
}
