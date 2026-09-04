import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import apiClient from '../lib/api';

type Theme = 'dark' | 'light';
type AccentColor = 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'teal';

interface ThemeContextType {
  theme: Theme;
  accentColor: AccentColor;
  setTheme: (t: Theme) => void;
  setAccentColor: (c: AccentColor) => void;
  toggleTheme: () => void;
}

const ACCENT_MAP: Record<AccentColor, { primary: string; hover: string; bg: string; text: string }> = {
  blue:   { primary: '#2563EB', hover: '#1D4ED8', bg: 'bg-blue-600', text: 'text-blue-600' },
  green:  { primary: '#16A34A', hover: '#15803D', bg: 'bg-green-600', text: 'text-green-600' },
  purple: { primary: '#7C3AED', hover: '#6D28D9', bg: 'bg-purple-600', text: 'text-purple-600' },
  orange: { primary: '#EA580C', hover: '#C2410C', bg: 'bg-orange-600', text: 'text-orange-600' },
  red:    { primary: '#DC2626', hover: '#B91C1C', bg: 'bg-red-600', text: 'text-red-600' },
  teal:   { primary: '#0D9488', hover: '#0F766E', bg: 'bg-teal-600', text: 'text-teal-600' },
};

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  accentColor: 'blue',
  setTheme: () => {},
  setAccentColor: () => {},
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => (localStorage.getItem('bz-theme') as Theme) || 'dark');
  const [accentColor, setAccentColorState] = useState<AccentColor>(
    () => (localStorage.getItem('bz-accent') as AccentColor) || 'blue'
  );

  // Apply theme class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('bz-theme', theme);
  }, [theme]);

  // Apply accent color as CSS variables
  useEffect(() => {
    const accent = ACCENT_MAP[accentColor] || ACCENT_MAP.blue;
    const root = document.documentElement;
    root.style.setProperty('--accent-primary', accent.primary);
    root.style.setProperty('--accent-hover', accent.hover);
    localStorage.setItem('bz-accent', accentColor);
  }, [accentColor]);

  // Sync to backend (debounced — don't spam API on every toggle)
  const syncToBackend = useCallback((data: { theme?: string; accentColor?: string }) => {
    const timer = setTimeout(() => {
      apiClient.put('/settings/theme', data).catch(() => {});
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    syncToBackend({ theme: t });
  };

  const setAccentColor = (c: AccentColor) => {
    setAccentColorState(c);
    syncToBackend({ accentColor: c });
  };

  const toggleTheme = () => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme, accentColor, setTheme, setAccentColor, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useAppTheme = () => useContext(ThemeContext);
export { ACCENT_MAP };
export type { AccentColor };
