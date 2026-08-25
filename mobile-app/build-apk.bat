@echo off
REM Build BizzAuto Android debug APK on Windows
REM Requires: JDK 17+ and Android SDK at C:\Users\HP\AppData\Local\Android\Sdk
REM Output: android\app\build\outputs\apk\debug\app-debug.apk

setlocal
set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
set "ANDROID_HOME=C:\Users\HP\AppData\Local\Android\Sdk"
set "ANDROID_SDK_ROOT=%ANDROID_HOME%"
set "Path=%JAVA_HOME%\bin;%Path%"

REM Create local.properties if missing (UTF-8, no BOM, forward slashes)
set "LP=%~dp0android\local.properties"
if not exist "%LP%" (
    > "%LP%" echo sdk.dir=C:/Users/HP/AppData/Local/Android/Sdk
    echo Created local.properties
)

cd /d "%~dp0android"
echo.
echo === Building debug APK ===
echo.
call gradlew.bat --no-daemon assembleDebug
if errorlevel 1 (
    echo.
    echo BUILD FAILED
    exit /b 1
)
echo.
echo === APK ready at: %~dp0android\app\build\outputs\apk\debug\app-debug.apk ===
