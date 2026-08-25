export interface Theme {
  id: string;
  name: string;
  description: string;
  colors: {
    primary: string;
    primaryDark: string;
    primaryLight: string;
    secondary: string;
    secondaryDark: string;
    secondaryLight: string;
    accent: string;
    accentDark: string;
    accentLight: string;
    bgPrimary: string;
    bgSecondary: string;
    bgTertiary: string;
  };
}

export const themes: Theme[] = [
  {
    id: 'default',
    name: 'Professional Blue',
    description: 'Clean, professional blue for SaaS',
    colors: {
      primary: '#2563eb',
      primaryDark: '#1d4ed8',
      primaryLight: '#3b82f6',
      secondary: '#3b82f6',
      secondaryDark: '#2563eb',
      secondaryLight: '#60a5fa',
      accent: '#f97316',
      accentDark: '#ea580c',
      accentLight: '#fb923c',
      bgPrimary: '#0f172a',
      bgSecondary: '#1e293b',
      bgTertiary: '#334155',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean Blue',
    description: 'Cool blue tones with teal accents',
    colors: {
      primary: '#0ea5e9',
      primaryDark: '#0284c7',
      primaryLight: '#38bdf8',
      secondary: '#06b6d4',
      secondaryDark: '#0891b2',
      secondaryLight: '#22d3ee',
      accent: '#f59e0b',
      accentDark: '#d97706',
      accentLight: '#fbbf24',
      bgPrimary: '#0c1222',
      bgSecondary: '#162032',
      bgTertiary: '#1e293b',
    },
  },
  {
    id: 'emerald',
    name: 'Emerald Green',
    description: 'Fresh green with nature tones',
    colors: {
      primary: '#10b981',
      primaryDark: '#059669',
      primaryLight: '#34d399',
      secondary: '#14b8a6',
      secondaryDark: '#0d9488',
      secondaryLight: '#2dd4bf',
      accent: '#f59e0b',
      accentDark: '#d97706',
      accentLight: '#fbbf24',
      bgPrimary: '#0a1a15',
      bgSecondary: '#132a20',
      bgTertiary: '#1a3a2d',
    },
  },
  {
    id: 'sunset',
    name: 'Warm Amber',
    description: 'Warm orange and amber tones',
    colors: {
      primary: '#f97316',
      primaryDark: '#ea580c',
      primaryLight: '#fb923c',
      secondary: '#f59e0b',
      secondaryDark: '#d97706',
      secondaryLight: '#fbbf24',
      accent: '#3b82f6',
      accentDark: '#2563eb',
      accentLight: '#60a5fa',
      bgPrimary: '#1a0f0a',
      bgSecondary: '#2a1a10',
      bgTertiary: '#3a2518',
    },
  },
  {
    id: 'royal',
    name: 'Royal Indigo',
    description: 'Rich indigo with balanced contrast',
    colors: {
      primary: '#6366f1',
      primaryDark: '#4f46e5',
      primaryLight: '#818cf8',
      secondary: '#8b5cf6',
      secondaryDark: '#7c3aed',
      secondaryLight: '#a78bfa',
      accent: '#f97316',
      accentDark: '#ea580c',
      accentLight: '#fb923c',
      bgPrimary: '#0f0a1a',
      bgSecondary: '#1a1029',
      bgTertiary: '#2a1838',
    },
  },
  {
    id: 'rose',
    name: 'Slate Gray',
    description: 'Neutral slate with professional blue',
    colors: {
      primary: '#475569',
      primaryDark: '#334155',
      primaryLight: '#64748b',
      secondary: '#64748b',
      secondaryDark: '#475569',
      secondaryLight: '#94a3b8',
      accent: '#2563eb',
      accentDark: '#1d4ed8',
      accentLight: '#3b82f6',
      bgPrimary: '#0f172a',
      bgSecondary: '#1e293b',
      bgTertiary: '#334155',
    },
  },
  {
    id: 'cyber',
    name: 'Cyber Teal',
    description: 'Bold teal with amber highlights',
    colors: {
      primary: '#14b8a6',
      primaryDark: '#0d9488',
      primaryLight: '#2dd4bf',
      secondary: '#06b6d4',
      secondaryDark: '#0891b2',
      secondaryLight: '#22d3ee',
      accent: '#f59e0b',
      accentDark: '#d97706',
      accentLight: '#fbbf24',
      bgPrimary: '#0a0f0f',
      bgSecondary: '#101a1a',
      bgTertiary: '#182828',
    },
  },
];

export const getThemeById = (id: string): Theme => {
  return themes.find(t => t.id === id) || themes[0];
};

export const applyTheme = (theme: Theme) => {
  const root = document.documentElement;
  const { colors } = theme;
  
  root.style.setProperty('--color-primary', colors.primary);
  root.style.setProperty('--color-primary-dark', colors.primaryDark);
  root.style.setProperty('--color-primary-light', colors.primaryLight);
  root.style.setProperty('--color-secondary', colors.secondary);
  root.style.setProperty('--color-secondary-dark', colors.secondaryDark);
  root.style.setProperty('--color-secondary-light', colors.secondaryLight);
  root.style.setProperty('--color-accent', colors.accent);
  root.style.setProperty('--color-accent-dark', colors.accentDark);
  root.style.setProperty('--color-accent-light', colors.accentLight);
  root.style.setProperty('--color-bg-primary', colors.bgPrimary);
  root.style.setProperty('--color-bg-secondary', colors.bgSecondary);
  root.style.setProperty('--color-bg-tertiary', colors.bgTertiary);
  root.style.setProperty('--shadow-glow', `0 0 20px ${colors.primary}40`);
};

export const getStoredTheme = (): string => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('app-theme') || 'default';
  }
  return 'default';
};

export const setStoredTheme = (themeId: string) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('app-theme', themeId);
  }
};