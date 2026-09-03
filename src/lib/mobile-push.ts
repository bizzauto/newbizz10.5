import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

/**
 * Mobile push registration — Capacitor Push Notifications (FCM).
 * Call after login when user opens the app. Sends FCM token to backend.
 */
export async function initMobilePush(businessId?: string) {
  if (!Capacitor.isNativePlatform()) return;

  try {
    // Request permission
    const status = await PushNotifications.checkPermissions();
    if (status.receive === 'prompt') {
      await PushNotifications.requestPermissions();
    }
    if (status.receive !== 'granted') {
      console.warn('[Push] Permission not granted');
      return;
    }

    // Register for push
    PushNotifications.addListener('registration', (token) => {
      const fcmToken = token.value;
      console.log('[Push] FCM token:', fcmToken.substring(0, 20) + '...');

      // Send token to backend
      fetch('/api/push-devices/register-device', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          token: fcmToken,
          platform: Capacitor.getPlatform(),
          businessId,
          appVersion: '1.0.0',
        }),
      }).catch((e) => console.warn('[Push] Token registration failed:', e));
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.warn('[Push] Registration error:', err.error);
    });

    // Handle incoming notifications
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[Push] Received:', notification.title);
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const url = action.notification.data?.url;
      if (url) window.location.href = url;
    });

    // Actually register
    await PushNotifications.register();
    console.log('[Push] Registered successfully');
  } catch (err: any) {
    console.warn('[Push] Init error:', err?.message);
  }
}
