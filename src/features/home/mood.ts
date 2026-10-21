import type { Mood } from '../../domain/entry/JournalEntry';

interface MoodLook {
  label: string;
  light: string;
  dark: string;
}

/**
 * Mood colours are muted on purpose. A saturated red "sad" dot next to an
 * entry reads as a warning light; the journal is not grading your day.
 */
const MOODS: Record<Mood, MoodLook> = {
  calm: { label: 'Calm', light: '#5B8FA8', dark: '#86B9D1' },
  happy: { label: 'Happy', light: '#C99A2E', dark: '#E8C064' },
  excited: { label: 'Excited', light: '#C9703A', dark: '#EE9E6C' },
  reflective: { label: 'Reflective', light: '#7A66B0', dark: '#A996DD' },
  neutral: { label: 'Neutral', light: '#8E877C', dark: '#A39C92' },
  tired: { label: 'Tired', light: '#7D8B99', dark: '#9DAAB8' },
  stressed: { label: 'Stressed', light: '#B0675A', dark: '#D99285' },
  sad: { label: 'Low', light: '#5E6FA3', dark: '#8E9CD0' },
  mixed: { label: 'Mixed', light: '#8F7A9A', dark: '#B8A3C3' },
  unknown: { label: 'Unclear', light: '#A0988B', dark: '#6E6962' },
};

export function moodLook(mood: Mood, isDark: boolean): { label: string; color: string } {
  const look = MOODS[mood];
  return { label: look.label, color: isDark ? look.dark : look.light };
}
