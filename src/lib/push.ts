import { Capacitor } from '@capacitor/core';
import api from './api.js';

/**
 * Mobile push registration — Option A (OneSignal).
 * Priority: OneSignal SDK (player_id) -> FCM token fallback.
 * Native-only; no-ops on web. Called once from main.tsx.
 */
export async function registerPush(): Promise<void> {
  if (typeof window === 'undefined' || !Capacitor.isNativePlatform()) return;
  try {
    // ── OneSignal path ──
    const appIdRes = await api
      .get('/push/onesignal/app-id')
      .catch(() => null);
    const oneSignalAppId: string | undefined = appIdRes?.data?.data?.appId;

    if (oneSignalAppId) {
      try {
        const OS: any = await import('onesignal-cordova-plugin');
        const OneSignal = OS.default?.OneSignal || OS.OneSignal || OS;
        OneSignal.setLogLevel(6, 0);
        OneSignal.initialize(oneSignalAppId);
        OneSignal.login((await api.get('/auth/me')).data?.user?.id || '');
        OneSignal.Notifications.addEventListener('foregroundWillDisplay', (e: any) => {
          e.preventDefault?.();
          e.getNotification?.().display?.();
        });
        OneSignal.Notifications.addEventListener('notificationClicked', (e: any) => {
          const url = e?.notification?.additionalData?.url;
          if (url) window.location.hash = url;
        });
        console.log('[push] OneSignal initialized');
        return; // OneSignal handles its own token; no FCM save needed
      } catch (e) {
        console.warn('[push] OneSignal SDK missing — falling back to FCM', e);
      }
    }

    // ── FCM fallback (Capacitor PushNotifications) ──
    await fcmRegister();
  } catch (e) {
    console.warn('[push] unavailable', e);
  }
}

async function fcmRegister(): Promise<void> {
  const { PushNotifications } = await import('@capacitor/push-notifications');
  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(); } };

    PushNotifications.addListener('registration', async (t) => {
      try {
        await api.post('/push/register-device', {
          token: t.value,
          platform: Capacitor.getPlatform(),
        });
        console.log('[push] FCM device registered');
      } catch (e) {
        console.warn('[push] token save failed', e);
      }
      done();
    });
    PushNotifications.addListener('registrationError', () => done());
    PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
      const url = (a.notification?.data as any)?.url;
      if (url) window.location.hash = url;
    });

    PushNotifications.requestPermissions().then((p) => {
      if (p.receive === 'granted') PushNotifications.register();
      else done();
    }).catch(done);
  });
}
