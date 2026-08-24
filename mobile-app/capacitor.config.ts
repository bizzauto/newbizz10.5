import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bizzauto.app',
  appName: 'BizzAuto',
  webDir: '../dist/client',

  // Server URL for production - change to your actual domain
  server: {
    cleartext: false,
    androidScheme: 'https',
    // Keep same-origin navigations inside the app shell (deep links to CRM pages)
    allowNavigation: ['bizzautoai.com', '*.bizzautoai.com'],
  },

  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },

  ios: {
    contentInset: 'always',
    allowsLinkPreview: false,
    scrollEnabled: true,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      launchFadeOutDuration: 400,
      backgroundColor: '#0F172A',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#0F172A',
      overlaysWebView: false,
    },
  },
};

export default config;
