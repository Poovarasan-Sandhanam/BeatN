import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import {
  darkPalette,
  lightPalette,
  motion,
  radius,
  spacing,
  typography,
  type Palette,
} from './tokens';

export interface Theme {
  colors: Palette;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  motion: typeof motion;
  isDark: boolean;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({
  children,
  /** Force a scheme. Used by tests and the developer screen. */
  scheme,
}: {
  children: ReactNode;
  scheme?: 'light' | 'dark';
}) {
  const system = useColorScheme();
  const isDark = (scheme ?? system) === 'dark';

  const theme = useMemo<Theme>(
    () => ({
      colors: isDark ? darkPalette : lightPalette,
      spacing,
      radius,
      typography,
      motion,
      isDark,
    }),
    [isDark],
  );

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside a ThemeProvider');
  return theme;
}
