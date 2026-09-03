import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemeName = 'light' | 'dark';

export interface Palette {
  background: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textMuted: string;
  border: string;
  /** Visible against `surface` - for control outlines like an unchecked checkbox. */
  borderStrong: string;
  accent: string;
  accentSoft: string;
  /** Korean convention: up = red, down = blue. */
  positive: string;
  negative: string;
  overlay: string;
}

// Light: Toss Securities-style soft neutrals with one confident accent.
export const lightPalette: Palette = {
  background: '#F2F4F6',
  surface: '#FFFFFF',
  surfaceMuted: '#F9FAFB',
  text: '#191F28',
  textMuted: '#8B95A1',
  border: '#F2F4F6',
  borderStrong: '#C3CAD3',
  accent: '#3182F6',
  accentSoft: '#EBF2FE',
  positive: '#F04452',
  negative: '#3182F6',
  overlay: 'rgba(4, 13, 23, 0.4)',
};

// Dark: same structure, values in the neighbourhood of rs-screener's dark theme.
export const darkPalette: Palette = {
  background: '#0E1117',
  surface: '#171C24',
  surfaceMuted: '#212936',
  text: '#EDF1F7',
  textMuted: '#98A2B1',
  border: '#232B37',
  borderStrong: '#3D4757',
  accent: '#5B9DFF',
  accentSoft: '#1B2A4D',
  positive: '#FF7180',
  negative: '#5B9DFF',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

const STORAGE_KEY = 'tweezy.theme';

interface ThemeContextValue {
  theme: ThemeName;
  colors: Palette;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeName>('light');

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!cancelled && (stored === 'light' || stored === 'dark')) setTheme(stored);
      })
      .catch(() => {
        // Storage unavailable (private mode, cleared site data) - light default is fine.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      colors: theme === 'dark' ? darkPalette : lightPalette,
      toggleTheme: () =>
        setTheme((current) => {
          const next = current === 'dark' ? 'light' : 'dark';
          AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
          return next;
        }),
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
