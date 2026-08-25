# Push Notifications — FCM Direct (Option B, FREE unlimited)

Zero cost, no subscriber cap, no third-party. Google Firebase Cloud
Messaging (FCM) HTTP v1 — server seedhe Google ko bhejta hai.

## Aapke steps (5 min)
1. Firebase console → project → **Project settings → Service accounts**
2. **Generate new private key** → JSON download karo
3. Us JSON se 3 fields copy karo:
   - `project_id`
   - `client_email`
   - `private_key` (pura, including `-----BEGIN...`)
4. BizzAuto app → Settings → Push (FCM) → teeno paste + Save
   (Ya API: `POST /api/push/fcm/config` with {projectId, clientEmail, privateKey})

## Mobile app
Kuch nahi — FCM path **pehle se live hai** (`src/lib/push.ts` →
Capacitor PushNotifications → auto `/push/register-device`).
Bas APK rebuild karo (pehle bana hua) aur install karo.

## Test
```bash
curl -X POST $BASE/api/push/fcm/test -H "Authorization: Bearer <token>"
```
App mein logged-in user ke device pe test notification aayega.

## Flow
App open → FCM token register → DB (DeviceToken) →
`FcmService.sendToUser()` → Google FCM → phone 📲
