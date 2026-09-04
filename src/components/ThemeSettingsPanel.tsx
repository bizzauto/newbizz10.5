import { useState, useEffect, useCallback } from 'react';
import { Moon, Sun, Palette, Check } from 'lucide-react';
import { useAppTheme, ACCENT_MAP, AccentColor } from '../contexts/ThemeContext';

export default function ThemeSettingsPanel() {
  const { theme, accentColor, setTheme, setAccentColor, toggleTheme } = useAppTheme();
  const [saved, setSaved] = useState(false);

  const accents: { name: AccentColor; label: string }[] = [
    { name: 'blue', label: 'Blue' },
    { name: 'green', label: 'Green' },
    { name: 'purple', label: 'Purple' },
    { name: 'orange', label: 'Orange' },
    { name: 'red', label: 'Red' },
    { name: 'teal', label: 'Teal' },
  ];

  const pickAccent = (c: AccentColor) => {
    setAccentColor(c);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-4 sm:p-5 md:p-6 border border-gray-200 dark:border-gray-700">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
        <Palette size={20} className="text-purple-600" />
        Appearance
      </h3>

      {/* Theme Toggle */}
      <div className="mb-8">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Theme</label>
        <div className="grid grid-cols-2 gap-3 max-w-xs">
          <button
            onClick={() => setTheme('dark')}
            className={`p-4 rounded-xl border-2 transition-all ${theme === 'dark'
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'}`}
          >
            <Moon size={24} className={`mx-auto mb-2 ${theme === 'dark' ? 'text-blue-600' : 'text-gray-400'}`} />
            <p className="text-sm font-medium text-gray-900 dark:text-white">Dark</p>
            {theme === 'dark' && <Check size={14} className="mx-auto text-blue-600 mt-1" />}
          </button>
          <button
            onClick={() => setTheme('light')}
            className={`p-4 rounded-xl border-2 transition-all ${theme === 'light'
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'}`}
          >
            <Sun size={24} className={`mx-auto mb-2 ${theme === 'light' ? 'text-orange-500' : 'text-gray-400'}`} />
            <p className="text-sm font-medium text-gray-900 dark:text-white">Light</p>
            {theme === 'light' && <Check size={14} className="mx-auto text-blue-600 mt-1" />}
          </button>
        </div>
      </div>

      {/* Accent Color */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Accent Color</label>
        <div className="flex flex-wrap gap-3">
          {accents.map(({ name, label }) => {
            const color = ACCENT_MAP[name].primary;
            return (
              <button
                key={name}
                onClick={() => pickAccent(name)}
                className={`w-11 h-11 rounded-full transition-all hover:scale-110 relative ${accentColor === name ? 'ring-2 ring-offset-2 ring-gray-900 dark:ring-white' : ''}`}
                style={{ backgroundColor: color }}
                title={label}
              >
                {accentColor === name && <Check size={18} className="text-white mx-auto" />}
              </button>
            );
          })}
        </div>
        {saved && <p className="text-xs text-green-600 mt-3 flex items-center gap-1"><Check size={12} /> Saved</p>}
      </div>
    </div>
  );
}
