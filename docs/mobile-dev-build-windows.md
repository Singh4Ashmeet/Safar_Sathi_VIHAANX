# SafarSaathi 2.0 — Windows Local Build & Integration Runbook (Dev C)

## 1. Local Toolchain (Already Verified on This Machine)
- **JDK 17:** `C:\Program Files\Microsoft\jdk-17.0.21.21-hotspot`
- **Android SDK:** `%LOCALAPPDATA%\Android\Sdk` (`platform-tools`, `android-35`, `android-36`, `build-tools 35.0.0 & 36.0.0`)
- **ADB:** `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`

Set these environment variables in PowerShell before running local Android builds (keeps Gradle/Temp caches on `D:\` where space is abundant):
```powershell
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.21.21-hotspot"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:GRADLE_USER_HOME = "D:\DevCache\.gradle"
$env:TEMP = "D:\DevCache\Temp"
$env:TMP = "D:\DevCache\Temp"
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
```

## 2. Running Against Prism Mock (Phase 1–2) or Live Backend
1. Copy `artifacts/safarsaathi/.env.example` to `artifacts/safarsaathi/.env` and set `EXPO_PUBLIC_FIREBASE_API_KEY`.
2. Start the OpenAPI mock server:
   ```powershell
   pnpm mock:api
   ```
3. Connect an Android phone over USB (`adb devices`) and forward port `4010`:
   ```powershell
   adb reverse tcp:4010 tcp:4010
   adb reverse tcp:8081 tcp:8081
   ```
4. Build & install the local dev-client APK:
   ```powershell
   pnpm --filter @workspace/safarsaathi android
   ```
5. Start Metro dev server:
   ```powershell
   pnpm --filter @workspace/safarsaathi dev
   ```

## 3. Regenerating API Client & Zod Schemas After OpenAPI Changes
```powershell
pnpm gen:api
pnpm typecheck
pnpm test
```

## 4. Local Signed Release APK (Milestone M5)
```powershell
cd artifacts\safarsaathi\android
.\gradlew.bat assembleRelease
# Output: artifacts\safarsaathi\android\app\build\outputs\apk\release\app-release.apk
```
Install on all demo phones:
```powershell
adb install -r app\build\outputs\apk\release\app-release.apk
```

## 5. Pre-Demo Warm-Up Checklist (15 Minutes Before Stage)
- Verify `GET /api/readyz` returns `status: "ready"` and recent `lastTickAgeSec`.
- Keep spare SIM phone on charger + Wi-Fi running **SMS Gateway for Android** with E2EE passphrase enabled.
- Run one test SOS + check `/t/{token}` guardian page on a basic mobile browser.
- Pre-cache demo route via `POST /api/v1/routes`.
