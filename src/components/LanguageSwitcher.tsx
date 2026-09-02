import { useState, useRef, useEffect } from 'react';
import { Languages, Check } from 'lucide-react';
import { useLanguage, languages } from '../contexts/LanguageContext';
import i18n from '../lib/i18n';

/**
 * Sidebar language switcher — supports 10 Indian languages.
 * Syncs both LanguageContext (landing page) and i18next (app UI).
 */
export default function LanguageSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = languages.find((l) => l.code === language) || languages[0];

  const pick = (code: string) => {
    setLanguage(code as any);
    try { i18n.changeLanguage(code); localStorage.setItem('language', code); } catch { /* noop */ }
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative px-2 pb-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-3 w-full hover:bg-white/10 rounded-xl p-2.5 transition-colors text-gray-400 hover:text-white"
        title={collapsed ? current.native : undefined}
      >
        <Languages size={16} />
        {!collapsed && (
          <span className="text-sm flex-1 text-left">{current.native}</span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 right-2 mb-2 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden z-50 max-h-72 overflow-y-auto">
          {languages.map((l) => (
            <button
              key={l.code}
              onClick={() => pick(l.code)}
              className="flex items-center justify-between w-full px-4 py-2.5 hover:bg-white/10 text-sm transition-colors"
            >
              <span className="text-gray-200">{l.native}</span>
              <span className="text-xs text-gray-500">{l.name}</span>
              {l.code === language && <Check size={14} className="text-green-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
