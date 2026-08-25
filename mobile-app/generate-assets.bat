@echo off
REM Generate Android icons + splash from resources\icon-only.png & splash.png
cd /d "%~dp0"
if not exist resources\icon-only.png (
  echo [!] resources\icon-only.png nahi mila - logo save karo pehle (README-LOGO.md dekho)
  pause & exit /b 1
)
if not exist resources\splash.png (
  echo [!] resources\splash.png nahi mila
  pause & exit /b 1
)
echo [1/2] Installing @capacitor/assets...
call npx --yes @capacitor/assets generate --android --iconBackgroundColor "#0F172A" --splashBackgroundColor "#0F172A"
echo [2/2] Done! Ab build-apk.bat chalao.
pause
