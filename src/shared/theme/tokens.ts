/**
 * Design tokens.
 *
 * BeatN should feel like a private notebook, not a dashboard: warm paper,
 * near-black ink, one accent, generous whitespace. Nothing shouts.
 *
 * Two deliberate choices:
 *   - The accent is a calm indigo, well away from red, so the *recording*
 *     colour is unambiguous. A journal that looks alarming is a journal
 *     nobody opens.
 *   - Dark mode is a first-class palette, not a filter over the light one.
 *     People write in bed.
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
  success: string;
  warning: string;
  danger: string;
}

export const lightPalette: Palette = {
  background: '#FAF8F5',
  surface: '#FFFFFF',
  surfaceSunken: '#F2EEE7',
  border: '#E7E1D7',

  ink: '#171512',
  inkMuted: '#6E675B',
  inkFaint: '#9A9386',
  onAccent: '#FFFFFF',

  accent: '#42548C',
  accentPressed: '#35456F',
  accentSoft: '#E9ECF5',

  recording: '#C0453B',
  success: '#3E6B52',
  warning: '#8A5E1F',
  danger: '#B23A2E',
};

export const darkPalette: Palette = {
  background: '#121113',
  surface: '#1C1B1E',
  surfaceSunken: '#0E0D0F',
  border: '#2F2D32',

  ink: '#F3F1ED',
  inkMuted: '#A49E94',
  inkFaint: '#716C65',
  onAccent: '#11131B',

  accent: '#9BADE4',
  accentPressed: '#8294CC',
  accentSoft: '#23283A',

  recording: '#E0685C',
  success: '#7FB395',
  warning: '#D4A259',
  danger: '#E0685C',
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
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export interface TypeStyle {
  fontSize: number;
  lineHeight: number;
  fontWeight: '400' | '500' | '600' | '700';
  letterSpacing?: number;
  textTransform?: 'uppercase';
  fontFamily?: string;
}

export const typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '600' },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '600' },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  /** Section eyebrows. Uppercase with tracking reads as structure, not shouting. */
  label: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' },
  /** Developer surfaces only — benchmarks, raw output, logs. */
  mono: { fontSize: 12, lineHeight: 17, fontWeight: '400', fontFamily: 'Courier' },
} as const satisfies Record<string, TypeStyle>;

export type TypeVariant = keyof typeof typography;

export const motion = {
  fast: 120,
  base: 200,
  slow: 320,
} as const;

/** Apple's minimum comfortable target. Nothing tappable goes below this. */
export const MIN_TAP_TARGET = 44;
