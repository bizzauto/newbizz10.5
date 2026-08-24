import { Capacitor } from '@capacitor/core';
import api from './api.js';

/**
 * Mobile push registration (Capacitor FCM token -> backend DeviceToken).
 * Native-only; no-ops on web. Called once from main.tsx after mount.
 */
export async function registerPush(): Promise<void> {
  if (typeof window === 'undefined' || !Capacitor.isNativePlatform()) return;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    return await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => { if (!settled) { settled = true; resolve(); } };

      PushNotifications.addListener('registration', async (t) => {
        try {
          await api.post('/push/register-device', {
            token: t.value,
            platform: Capacitor.getPlatform(),
            appVersion: process.env.BUILD_VERSION || undefined,
          });
          console.log('[push] device registered');
        } catch (e) {
          console.warn('[push] token save failed', e);
        }
        done();
      });

      PushNotifications.addListener('registrationError', (e) => {
        console.warn('[push] registrationError', e);
        done();
      });

      PushNotifications.addListener('pushNotificationReceived', (n) => {
        console.log('[push] received', n.title);
      });

      PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
        const url = (a.notification?.data as any)?.url;
        if (url) window.location.hash = url;
      });

      PushNotifications.requestPermissions().then((p) => {
        if (p.receive === 'granted') PushNotifications.register();
        else done();
      }).catch(done);
    });
  } catch (e) {
    console.warn('[push] unavailable', e);
  }
}
