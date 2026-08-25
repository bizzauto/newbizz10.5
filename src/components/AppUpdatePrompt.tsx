import { useState, useEffect } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { MobileApp } from '../lib/capacitor-app';

/**
 * App Update Prompt - Shows when a new version is available
 * Only shows on native mobile apps
 */
const AppUpdatePrompt: React.FC = () => {
  const [showUpdate, setShowUpdate] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);

  useEffect(() => {
    const checkForUpdate = async () => {
      if (!MobileApp.isNative()) return;

      try {
        const appInfo = await MobileApp.getAppInfo();
        if (appInfo) {
          setCurrentVersion(appInfo.version);
          
          // Check if there's a newer version available
          // This would typically compare with your server
          const lastVersion = localStorage.getItem('appVersion');
          if (lastVersion && lastVersion !== appInfo.version) {
            setShowUpdate(true);
          }
          localStorage.setItem('appVersion', appInfo.version);
        }
      } catch (err) {
        console.log('Update check error:', err);
      }
    };

    checkForUpdate();
  }, []);

  if (!showUpdate || !currentVersion) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-sm w-full p-6 shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              <RefreshCw size={24} className="text-white" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">Update Available</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">v{currentVersion}</p>
            </div>
          </div>
          <button
            onClick={() => setShowUpdate(false)}
            className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
          A new version of BizzAuto is available with improved features and bug fixes.
        </p>

        <div className="flex gap-3">
          <button
            onClick={() => setShowUpdate(false)}
            className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-medium text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            Later
          </button>
          <button
            onClick={() => {
              // In production, this would trigger app store update
              window.location.reload();
              setShowUpdate(false);
            }}
            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl font-medium text-sm hover:from-blue-600 hover:to-purple-700 transition-all"
          >
            Update Now
          </button>
        </div>
      </div>
    </div>
  );
};

export default AppUpdatePrompt;
