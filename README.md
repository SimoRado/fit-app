# Better Every Day

Offline-first Expo app for fitness tracking and personal growth. Clerk handles account sign-in, SQLite remains the fitness data source, and Convex is connected for authenticated cloud access. Fitness data synchronization is not enabled yet; see [CONVEX_INTEGRATION.md](CONVEX_INTEGRATION.md).

## Run on Android

1. Install the **Expo Go version for SDK 58** on the Android phone and connect the phone and development computer to the same Wi-Fi network.
2. Use a supported Node.js version (22.13+ or 24.3+), then in this project folder run `npm install` and `npm run start`.
3. Scan the QR code shown by Expo with the phone camera or Expo Go. Keep the development computer and phone on the same local network; allow the development server through the computer firewall if prompted.
4. Sign in or create an account with email verification, complete fitness onboarding, then check that the profile, a habit completion, a workout with a set, and a weight entry remain after closing and reopening Expo Go.
5. For reminder checks, enable notification permission and one reminder. Set its time a few minutes ahead, lock the phone, and check delivery. Change its time and verify the old schedule does not fire; disable it and verify it is cancelled. Android power management can delay or suppress notifications. Android 12+ may also deliver scheduled reminders approximately unless exact-alarm access is configured and granted; this app does not request that special access.

The app uses Expo SQLite and local notifications, both available in Expo Go for SDK 58. Remote push notifications require a development build. The Android application ID is `com.bettereveryday.fitness`; verify it is available before any store release. No cloud build is configured or required for Expo Go testing.

## Run and verify

```sh
npm install
npm run start
npm run typecheck
npm run lint
npm test
npx expo-doctor
npx expo export --platform android --output-dir dist-android
npx expo export --platform ios --output-dir dist-ios
```

The JavaScript exports check bundling. They do not compile native projects or confirm behavior on a physical device. The current project does not include generated `android/` or `ios/` directories.

If Windows blocks Expo's Hermes compiler executable during a local export, retry with `--no-bytecode`. That verifies Metro JavaScript bundling only and omits Hermes bytecode; it is a diagnostic fallback, not native build verification.

## Structure

- `src/app/`: Expo Router screens and tab navigation.
- `src/data/db.ts`: SQLite initialization, migrations, and repositories.
- `src/data/schema.ts`: preserving schema migrations and static exercise definitions.
- `src/core/`: domain types, local-calendar rules, calculations, validation, translations, and motivation cards.
- `src/services/reminders.ts`: local reminder permissions and scheduling reconciliation.
- `src/state/`: profile, language preference, and screen refresh context.
- `src/ui/`: shared controls, localized text, and design tokens.

Dates used for habit, mission, weight, and workout day keys are local `YYYY-MM-DD` calendar dates. Workout start instants are stored as UTC ISO strings after interpreting the form's local date and time. Habit weeks run Monday through Sunday. Quota-habit streaks count consecutive completed weeks; fixed-frequency streaks count scheduled occurrences and skip unscheduled days.

English, French, and Arabic interface text comes from centralized resources. Arabic alignment is set on app components and inputs at runtime. The app does not force the operating system's global RTL mode; some native system surfaces may still follow the phone's system language and should be reviewed on device.

The interface uses locally bundled static instances of Big Shoulders Display, Instrument Sans, JetBrains Mono, and IBM Plex Sans Arabic. Their SIL Open Font License texts are included in `assets/fonts/`. Motion respects the operating system's reduced-motion setting.

## Data and repository hygiene

SQLite stays in the app's private document directory. Migrations preserve existing records; startup does not clear user data. Keep real `.env` files, local database files, signing keys, and build output out of version control. Store safe examples in `.env.example` without credentials.

The workout-set migration adds a completion flag with a default of completed for existing sets, preserving their contribution to past statistics. New sessions can keep planned sets unchecked; only checked sets contribute to completed workout totals and personal records. Unsaved workout edits remain available when the route is reopened during the same app session. Save a workout as a draft to retain it after the app closes.

## Current limits

The project is still an MVP. Reminder delivery, Android keyboard behavior, small-screen layout, and Arabic system surfaces need physical-device review. Expo exports and automated tests do not provide native build or device verification. The Android application ID should be confirmed as unique before release. The dependency audit has unresolved moderate findings in Expo's CLI/config dependency tree; see the Phase 1.5 completion report for the checked packages and compatibility decision.
