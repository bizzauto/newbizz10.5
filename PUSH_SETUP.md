# Push Notifications — OneSignal Setup (Option A)

## Aapke steps (10 min)
1. https://onesignal.com → account → **New App/Website** → name: `BizzAuto`
2. Platform: **Google Android** → apna Firebase Server Key + Sender ID daalo
   (Firebase console → Project settings → Cloud Messaging)
3. App Settings → **Keys & IDs** → copy:
   - **OneSignal App ID** (UUID)
   - **REST API Key**
4. BizzAuto app → Settings → OneSignal Settings → dono paste + Connect
   (Integration table mein `onesignal` active ho jayega)

## Mobile app side (ek baar)
```bash
cd mobile-app
npm i onesignal-cordova-plugin
npx cap sync android
```
Phir APK rebuild (`build-apk.bat`). App khulte hi OneSignal initialize +
login(userId) ho jayega — `src/lib/push.ts` khud handle karta hai.

## Test send (server se)
```bash
curl -X POST $BASE/api/push/onesignal/test -H "Authorization: Bearer <token>"
```
Ya admin panel se segment `Subscribed Users` ko bhejo.

## Flow
App open → GET /api/push/onesignal/app-id → OneSignal.initialize(appId)
→ OneSignal.login(userId) → notifications OneSignal console/API se
`include_player_ids` ya segments pe jaati hain (OneSignalService ready hai).
