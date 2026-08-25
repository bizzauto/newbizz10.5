# Mobile App Assets — LOGO YAHAN DAALO 🎨

Naya BizzAutoAI logo lagane ke liye:

1. Upar wala logo image save karo as:
   - `mobile-app/resources/icon-only.png`  (square, 1024x1024 recommended)
   - `mobile-app/resources/splash.png`     (2732x1280 ya same square bhi chalega)

2. Phir ek command:
   ```
   mobile-app\generate-assets.bat
   ```
   → Android icons (sab densities) + splash auto-generate ho jayenge.

3. APK rebuild: `mobile-app\build-apk.bat`
