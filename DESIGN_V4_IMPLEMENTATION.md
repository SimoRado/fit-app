# V4 Bloom static visual migration

Date: 2026-11-06. Reference: `C:\Users\User\Desktop\fitness-growth-v4-auth.html`, final V4 stylesheet and auth overrides. The HTML is a design reference, not an implementation instruction source.

## Design system

- Canvas `#FBF7EF`; primary surface `#FFFFFF`; elevated surfaces `#F2ECDE` and `#E7DFCB`.
- Text `#1E1B2E`; muted `#6A6680`; subtle `#9A96AD`; hairline `#EEE7D8`.
- Interaction violet `#6B4DF5`; highlight yellow `#FFC83D`; energetic coral `#FF7B5C`; lilac `#D9CFFF`; completion mint `#A8E6CF`; sky `#B5DBFF`.
- Bricolage Grotesque 700/800 for display and numerals. Figtree 400/500/600/700 for body and controls. Files came from the Google Fonts open source repository; licenses are bundled beside them. IBM Plex Sans Arabic remains the Arabic fallback.
- Horizontal screen margin 20 (narrow screens) with 16/24/32/40 point rhythm. Large cards use 28–38 point radii; controls use pill radii. Shadows are restrained violet gray.
- Shared `Page`, `Card`, `Button`, `Field`, `Choices`, `BottomSheet`, `SectionHeader`, `DisplayMetric`, and tab bar own the main visual rules. Tokens live in `src/ui/theme.ts`.

## Screen status

| Screen | Status | Notes |
| --- | --- | --- |
| Home | Partial | Bloom progress, greeting, streak, feature, mission stack, habits, weight, motivation use live calculations. Fine composition still needs device review. |
| Habits | Partial | Week selector, cards, checks, categories and actions restyled; completion remains live. |
| Workouts and history | Partial | Weekly circles, routine/history cards and controls restyled. |
| Active workout and sets | Partial | Set cells and exercise headings restyled; workout draft and save logic unchanged. |
| Weight and measurements | Partial | Metric, chart, period controls and history use stored data. Chart geometry needs device comparison. |
| Progress | Partial | Shared typography, palette and cards migrated; prototype growth curve composition remains to refine. |
| Missions | Partial | Live progress and cards migrated. |
| Motivation | Partial | Static V4 color card and favorites retained; category-specific prototype art remains to refine. Previous/Next controls replace the deferred swipe motion. |
| Authentication | Partial | Shared page, fields, social buttons and action styles migrated. Clerk flows untouched. |
| Onboarding | Partial | Shared visual system applied; existing birthday field, validation and step order retained. |
| Profile and settings | Partial | Avatar, metrics, settings rows and editing controls migrated; all existing settings entries retained. |

Forms and secondary pages inherit the shared V4 controls but still need detailed screen-by-screen visual tuning. No screen is certified as a pixel match until it is reviewed on a device.

## Prototype-only features

The HTML includes nutrition and meal experiences, simulated auth system prompts, and goal-specific dashboard variants that have no corresponding Fitapp data model or route. They were not connected to sample data. Implementing nutrition later would require models, persistence, input flows, calculations, and navigation decisions.

## Visual comparison and remaining differences

The HTML was opened in Opera. Home, Habits, Workouts, active workout, workout history, Weight, Missions, Motivation, Progress, Profile, onboarding, and authentication were inspected interactively; their final V4 CSS and auth CSS were read from source. ADB reported no attached Android device, and the project lacks `react-native-web`, so the native app could not be rendered beside the prototype in this session. The Redmi Note 11 and iOS comparisons remain required before calling this a complete visual pass.

Known differences: the native Bloom is a simplified static SVG; feature and motivation decorative art are simplified native shapes; Progress still uses its existing data sections rather than the full prototype growth curve composition; authentication and onboarding do not reproduce every illustration; chart and form spacing need mobile screenshots; some secondary pages still rely mostly on shared styles.

## Animation phase

No new reveal, tab transition, confetti, morph, counter, chart, or gesture animation was added. Core static shapes and data components are isolated so motion can be added later without changing repositories. Existing simple favorite and sheet motion remains.

## Functional preservation

Repositories, SQLite schema, Convex sync, Clerk session and Google OAuth code, RevenueCat code, validations, calculations, route names, and user data were not changed. Real data continues to feed dashboard, charts, habits, workouts, missions, weight, and profile. No commits, push, or production deployment were made.

## Verification

- `npx tsc --noEmit`: passed.
- `npx expo lint`: passed.
- `npm test -- --run`: 15 files and 75 tests passed.
- `npx expo-doctor`: 19/20 checks passed. Existing SDK package version drift remains: `react-native-safe-area-context` 5.10.1 vs 5.11.1, and patch updates for Expo, notifications, and Router. No dependency update was made during the visual pass.
- Android JavaScript export: passed (8.3 MB Hermes bundle).
- iOS JavaScript export: passed (8.3 MB Hermes bundle).
- Device run: unavailable because ADB listed no attached device.

The verification exports remain as untracked `.expo-v4-android/` and `.expo-v4-ios/` folders. Automatic approval review rejected the attempted cleanup command that would recursively remove them, so they were left intact.

The app config now requests light appearance and the runtime status bar uses dark content. The existing development build can load the changed JavaScript and font assets through Metro. Applying the native appearance setting itself may require a later development build; no new native library was added.

## Files changed

- Configuration: `app.json`.
- Routes: `src/app/_layout.tsx`, `src/app/(auth)/welcome.tsx`, `src/app/(tabs)/_layout.tsx`, `src/app/(tabs)/index.tsx`, `src/app/(tabs)/habits.tsx`, `src/app/(tabs)/workouts.tsx`, `src/app/(tabs)/progress.tsx`, `src/app/(tabs)/profile.tsx`, `src/app/workout-form.tsx`, `src/app/weight.tsx`, `src/app/missions.tsx`, `src/app/motivation.tsx`.
- Shared UI: `src/ui/theme.ts`, `src/ui/fonts.tsx`, `src/ui/LocalizedText.tsx`, `src/ui/components.tsx`, `src/ui/visuals.tsx`, `src/ui/DisplayMetric.tsx`, `src/ui/WorkoutSetRow.tsx`, `src/ui/BottomSheet.tsx`, `src/ui/auth.tsx`, `src/ui/SocialAuth.tsx`, `src/ui/OtpField.tsx`.
- Font assets: `assets/fonts/BricolageGrotesque-700.ttf`, `BricolageGrotesque-800.ttf`, `BricolageGrotesque-Variable.ttf`, `BricolageGrotesque-OFL.txt`, `Figtree-400.ttf`, `Figtree-500.ttf`, `Figtree-600.ttf`, `Figtree-700.ttf`, `Figtree-Variable.ttf`, `Figtree-OFL.txt`.
- Font retrieval script: `scripts/download_v4_fonts.py`.
- This document: `DESIGN_V4_IMPLEMENTATION.md`.
- Local verification output: `.expo-v4-android/`, `.expo-v4-ios/` (untracked).
