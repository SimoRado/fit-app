# Cubyfit Dev — daily Android development over Wi-Fi

Two apps live side by side on the phone:

| App | Package | OAuth callback | JavaScript |
|---|---|---|---|
| **Cubyfit Dev** (label "Cubyfit Dev") | `com.bettereveryday.fitness.dev` | `betterday-dev://oauth-callback` | Loaded live from Metro, Fast Refresh |
| **Preview** (label "Better Every Day") | `com.bettereveryday.fitness` | `betterday://oauth-callback` | Embedded in the APK |

They have separate data, sessions and SQLite databases. Installing or reinstalling Cubyfit Dev never touches the preview. Expo Go is **not** used: it cannot receive Cubyfit's OAuth callback and lacks RevenueCat/AdMob/Sentry native code.

## Daily command

```powershell
npm run dev:android
```

This will:

1. Stop any stale Cubyfit Metro server (any port) and refuse to stop anything else.
2. Start **one** Metro server on port **8081** in dev-client mode, advertising the PC's Wi-Fi IP rather than a VMware adapter.
3. If the phone is connected through wireless debugging, open Cubyfit Dev on this server automatically.

Add `-- -Tunnel` only if the router blocks phone-to-PC traffic, and add `-- -Clear` once after changing `babel`/`metro` config or env values.

## Open Cubyfit Dev

- **Automatic**: with wireless debugging connected (see below), the app opens on its own once Metro is ready.
- **Manual**: open **Cubyfit Dev** → *Enter URL manually* → `http://<PC Wi-Fi IP>:8081` (the script prints it), or scan the QR in the terminal with the phone camera. Do not scan it with Expo Go.

The phone and PC must be on the same Wi-Fi.

## Is it connected?

Connected means **all** of these:

- Metro prints `Android Bundled … index.js`.
- The phone shows Cubyfit, not the dev launcher's server list.
- Pressing `r` in the Metro terminal reloads the phone. "No apps connected" means it is **not** connected.

Real proof: change any visible text in a screen under `src/app/`, save, and see it change on the phone within a few seconds, with no rebuild.

## Recover from a disconnected session

1. On the phone, shake the device or press the floating dev tools button → **Reload**. If it shows the launcher, tap the server again.
2. Still nothing: stop Metro (Ctrl+C) and run `npm run dev:android` again. That's one restart, not repeated cache clears.
3. Fast Refresh off? Dev menu → enable **Fast Refresh**.

## Wireless debugging (no USB cable)

Needed only for installing an APK and for the automatic open. Daily Fast Refresh works without it.

1. Phone: Developer options → **Wireless debugging** ON → *Pair device with pairing code*.
2. PC: `& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" pair <IP:pairing-port>` and enter the code (once per PC).
3. PC: `adb connect <IP:port>` using the port on the main Wireless debugging screen. The port changes when wireless debugging restarts.

## Stop

Press Ctrl+C in the Metro terminal.

## When an APK rebuild is required

JavaScript/TypeScript/styles/assets never need one; they arrive through Metro.
Rebuild Cubyfit Dev with `npm run android:apk:dev` only after changing:

- native dependencies (`npx expo install` of a package with native code), or Expo SDK version
- `app.json`, `app.config.js`, files in `plugins/`, permissions, scheme or package identity
- `GOOGLE_ADMOB_APP_ID`

Install the rebuilt APK as an update of the dev app only:

```powershell
adb install -r builds\local\cubyfit-development.apk
```

The build script verifies the APK is `com.bettereveryday.fitness.dev` with only the `betterday-dev` scheme before it can be used.

## External requirement

Clerk dashboard (the existing application) → Native applications → **Allowlist for mobile SSO redirect** must contain both `betterday://oauth-callback` (preview) and `betterday-dev://oauth-callback` (Cubyfit Dev). Google and Apple return through Clerk's own domain, so no Google Cloud or Apple Developer change is needed for the dev package.
