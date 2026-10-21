import { Platform } from 'react-native';

/**
 * Design tokens.
 *
 * BeatN should feel like a private notebook, not a dashboard: warm paper,
 * near-black ink, one accent, generous whitespace. Nothing shouts.
 *
 * Deliberate choices:
 *   - The accent is a calm indigo, well away from red, so the *recording*
 *     colour is unambiguous. A journal that looks alarming is a journal
 *     nobody opens.
 *   - Dark mode is a first-class palette, not a filter over the light one.
 *     People write in bed.
 *   - Headlines and the words you spoke are set in a serif. Chrome — buttons,
 *     labels, metadata — stays in the system sans. The split tells you at a
 *     glance what is *yours* and what is the app.
 */

export interface Palette {
  /** Page background. */
  background: string;
  /** Raised content — cards, sheets. */
  surface: string;
  /** Recessed content — inputs, progress tracks. */
  surfaceSunken: string;
  border: string;

  /** Primary text. */
  ink: string;
  /** Secondary text — metadata, captions. */
  inkMuted: string;
  /** Tertiary text — timestamps, disabled. */
  inkFaint: string;
  /** Text on an accent-filled surface. */
  onAccent: string;

  accent: string;
  accentPressed: string;
  /** Tinted background for accent-adjacent surfaces. */
  accentSoft: string;

  /** Active recording. Deliberately distinct from `accent` and from `danger`. */
  recording: string;
  /** Halo behind the live recording control. */
  recordingSoft: string;
  success: string;
  warning: string;
  danger: string;
  /** Tinted background for a destructive or failed state. */
  dangerSoft: string;

  /** Colour of drop shadows. Shadows are near-invisible in dark mode by design. */
  shadow: string;
}

export const lightPalette: Palette = {
  background: '#F6F3EE',
  surface: '#FFFFFF',
  surfaceSunken: '#EDE8E0',
  border: '#E3DCD1',

  ink: '#1A1714',
  inkMuted: '#6B6459',
  inkFaint: '#A0988B',
  onAccent: '#FFFFFF',

  accent: '#4251A8',
  accentPressed: '#36438C',
  accentSoft: '#E7E9F6',

  recording: '#D2493D',
  recordingSoft: '#F8DEDA',
  success: '#3E7A57',
  warning: '#9A6A22',
  danger: '#B23A2E',
  dangerSoft: '#F7E2DF',

  shadow: 'rgba(40, 30, 15, 0.10)',
};

export const darkPalette: Palette = {
  background: '#0F0E11',
  surface: '#1A191D',
  surfaceSunken: '#0A090C',
  border: '#2A2830',

  ink: '#F4F1EC',
  inkMuted: '#A7A096',
  inkFaint: '#6E6962',
  onAccent: '#0F1122',

  accent: '#A8B3FF',
  accentPressed: '#8F9BEB',
  accentSoft: '#1E2142',

  recording: '#FF6B5E',
  recordingSoft: '#3A1916',
  success: '#82C29C',
  warning: '#E0AE62',
  danger: '#FF7A6E',
  dangerSoft: '#341613',

  shadow: 'rgba(0, 0, 0, 0.45)',
};

/** 4pt base. Using the scale instead of raw numbers keeps rhythm consistent. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export interface TypeStyle {
  fontSize: number;
  lineHeight: number;
  fontWeight: '300' | '400' | '500' | '600' | '700';
  letterSpacing?: number;
  textTransform?: 'uppercase';
  fontFamily?: string;
  fontVariant?: 'tabular-nums'[];
}

/** iOS ships Georgia; Android maps `serif` to Noto Serif. Both read as "paper". */
const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });
const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

export const typography = {
  /** One per screen at most — the greeting, the recording timer. */
  hero: { fontSize: 40, lineHeight: 46, fontWeight: '400', fontFamily: serif, letterSpacing: -0.5 },
  display: { fontSize: 32, lineHeight: 38, fontWeight: '400', fontFamily: serif, letterSpacing: -0.3 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '400', fontFamily: serif },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  /** Long-form reading: transcripts and reflections. */
  reading: { fontSize: 18, lineHeight: 29, fontWeight: '400', fontFamily: serif },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  captionStrong: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  /** Section eyebrows. Uppercase with tracking reads as structure, not shouting. */
  label: { fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase' },
  /** Stat tiles and timers — digits must not jitter as they change. */
  numeric: { fontSize: 28, lineHeight: 32, fontWeight: '400', fontFamily: serif, fontVariant: ['tabular-nums'] },
  timer: { fontSize: 64, lineHeight: 72, fontWeight: '300', fontVariant: ['tabular-nums'], letterSpacing: -1 },
  /** Developer surfaces only — benchmarks, raw output, logs. */
  mono: { fontSize: 12, lineHeight: 17, fontWeight: '400', fontFamily: mono },
} as const satisfies Record<string, TypeStyle>;

export type TypeVariant = keyof typeof typography;

export const motion = {
  fast: 120,
  base: 220,
  slow: 360,
  /** Stagger between list items as they enter. */
  stagger: 40,
} as const;

/** Apple's minimum comfortable target. Nothing tappable goes below this. */
export const MIN_TAP_TARGET = 44;
