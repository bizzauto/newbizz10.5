import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useUIMode } from '../contexts/UIModeContext';

const UIModeToggle: React.FC = () => {
  const { mode, setMode } = useUIMode();

  return (
    <div className="fixed top-3 right-3 sm:bottom-6 sm:top-auto sm:right-6 z-40">
      <button
        onClick={() => setMode(mode === 'classic' ? 'ai' : 'classic')}
        className="flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all text-sm font-medium"
        title={mode === 'classic' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
      >
        {mode === 'classic' ? (
          <Moon size={16} className="text-blue-600 dark:text-blue-400" />
        ) : (
          <Sun size={16} className="text-amber-500" />
        )}
        <span className="hidden sm:inline">{mode === 'classic' ? 'Dark' : 'Light'}</span>
      </button>
    </div>
  );
};

export default UIModeToggle;
