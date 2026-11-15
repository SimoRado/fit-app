# Cubyfit — Performance, Responsiveness & UX Stabilization Report

**Branch:** `working`. Builds on the uncommitted workout-builder and exercise-library work, all of it kept. Nothing was committed, pushed, installed or uninstalled.
**Device:** No Android device was connected (`adb devices` was empty), so **no on-device measurements were possible.** Every timing below is either a desktop proxy (Node/V8 with JIT) or a count of operations. Each one is labelled. Hermes on a mid-range phone runs JavaScript without a JIT, so JavaScript-heavy work there is typically several to many times slower than these desktop numbers.

---

## 1. Root causes (confirmed in code and library behaviour)

### A. Database writes collided and failed silently or intermittently (both Metro and APK)
- **What expo-sqlite does:** `withExclusiveTransactionAsync` opens a **new native connection** for every call. Its own documentation says that while that transaction writes, "other async write queries will abort with `database is locked`".
- **How our SQLite is built:** the bundled SQLite (`node_modules/expo-sqlite/android/build.gradle`) has no busy timeout, no WAL and no `SQLITE_DEFAULT_FOREIGN_KEYS`. Our code never set any of these either.
- **How often it happens:** 25 code paths use exclusive transactions (routine save, workout autosave on every keystroke, sync acknowledgements, cloud restore, reminders, nutrition…). Whenever two overlapped, for example a user save while sync or reminder reconciliation ran, one failed **immediately** with `database is locked`, and reads could also fail during the other connection's commit.
- **What the user sees:** buttons that "do nothing", intermittent routine-save failures, and screens that sometimes fail to load.
- **Side finding:** `PRAGMA foreign_keys` is per-connection, so `ON DELETE CASCADE` never ran inside those transactions. Discarding a live workout left its sets in the database, and deleting a routine through the new store left its exercise links.

### B. Every database call waited for the 1,321-exercise catalog import (both; worst on first launch after install or update)
- `db()` awaited `importExerciseCatalog()` before returning, so **every** repository call app-wide waited for it.
- **Import cost:** about 3,967 individual native calls carrying 11.5 MB of strings in one long transaction (measured; see §2). 96% of the 11.5 MB is instruction text in 10 languages; the app shows English, French or Arabic.
- **Failure mode:** if the import failed, the whole database open failed and was retried from scratch on the next query.

### C. First-launch food catalog work saturated the JavaScript thread (standalone APK, fresh install)
On the first Nutrition visit on a fresh install, before food search could answer:
- SHA-256 of the **85 MB** bundled archive in JavaScript (`@noble/hashes`)
- Inflating it to **313 MB** in JavaScript (`fflate`)
- SHA-256 of the 313 MB result in JavaScript
- Integrity check

Measured on desktop Node: **≈4.2 s of pure JS compute** (hash 0.4 s + inflate 2.3 s + hash 1.5 s). On Hermes without a JIT this becomes much longer. Each 1 MB slice of hashing or inflating ran synchronously, so every tap waited behind it.

This explains why the **standalone APK** (fresh data) felt slow while an already-initialized Metro dev client did not.

### D. Reload bursts after every action (both)
- **Tab reloads:** `changed()` bumps a global `revision`. All five tab screens stay mounted and reloaded **all** their SQLite data on every bump, even while hidden: about 40 queries, including Progress reading every workout set.
- **Sync:** the sync provider also started a cycle on every bump (status queries, network, per-operation acknowledgement transactions). This competed with the user's next tap and fed root cause A.

### E. Active Workout re-rendered everything every second (both)
The elapsed timer was screen state ticking every 1,000 ms, and the rest timer every 500 ms. Every exercise block and every set row with its `TextInput` re-rendered on every tick.

### F. A routine-save blocker in the builder (both)
Values typed into a set that was later removed stayed in the builder's validation map. An invalid leftover value (for example reps `8.5`) blocked Save with "Check your sets" even though no visible set was wrong.

### Metro vs standalone differences
| Symptom | Cause |
|---|---|
| Exercise library "works in Metro, fails in APK" | The bundled JSON module is identical in both builds: it's a static import, and the test confirms 1,321 rows and no network use. The difference is **state**: the APK runs on fresh data, so the first-launch import (B) and the food-catalog initialization (C) ran there, and any `database is locked` collision (A) during that window broke the library. The dev client had usually finished both long ago. |
| Slowness in both | A, D and E apply to both builds. Metro is generally slower again because of development-mode JavaScript. |
| `__DEV__ = false` only issues | None found. Dev diagnostics are already `__DEV__`-gated, Sentry is light (5% traces, no replay), and there is no dependency on a development server. |

## 2. Measurements

| What | Before | After | Type |
|---|---|---|---|
| Catalog import: native calls | 3,967 | **46** | Counted (test adapter) |
| Catalog import: bound string payload | 11.5 MB | **3.0 MB** | Counted |
| Catalog import: transactions | 1 long | 15 short (100 rows each) | Counted |
| Catalog import wall time | 3,219 ms | 49 ms | Desktop node:sqlite proxy; the "before" run also paid the one-time module load |
| Database calls waiting for the catalog | **All** | Only exercise-library calls | Code path |
| Food first-launch JS work before search answers | ≈4.2 s of desktop JS (hash + inflate + hash) | **0**: the starter catalog answers right away; the full library inflates in the background with no JS hashing, yielding between 64 KB slices | Desktop proxy + code path |
| Exercise JSON load / parse | 70 ms / 35 ms | unchanged (same dataset) | Desktop proxy |
| Tab screens reloading after each change | 5 (all mounted) | **1** (the focused one; others catch up on focus) | Code path |
| Active Workout renders per second | Whole screen | **Timer text only** (rest chip only while visible) | Code path |
| Tap → handler, save start → finish, screen mount | — | **Not measured** (no device) | Dev-only `[perf]` markers added |

**Dev-only instrumentation** (`src/core/perf.ts`) logs durations only, never data, and is a no-op in release builds. It covers:
- catalog ready time
- writes waiting in the queue longer than 50 ms
- write transactions longer than 50 ms
- routine save duration and failure

Run the dev client and filter Metro logs for `[perf]` to get the on-device numbers.

## 3. Fixes

| File | Change |
|---|---|
| `src/data/db.ts` | WAL mode and a 5 s `busy_timeout` on the account database. All exclusive transactions now run **one at a time on one long-lived writer connection** (`BEGIN IMMEDIATE`, also with the busy timeout) instead of a new connection per write. **Catalog import is off the critical path:** a background import starts 1.5 s after open, `ensureExerciseCatalog()` awaits it only for exercise queries (and cloud restore), and a failure is retried on the next call. `exerciseCatalogState`/`subscribe` expose loading, ready and error. Discarding a live workout deletes its sets and exercise links explicitly. |
| `src/data/exerciseCatalog.ts` | Multi-row upserts in 100-row transactions. The version marker is written last, so an interrupted import resumes. Instructions are stored for en/fr/ar only; the bundled dataset itself is unchanged. |
| `src/data/routineStore.ts` | Explicit `routine_exercises` delete when a routine is deleted. |
| `src/data/syncLocal.ts` | Cloud restore waits for the catalog before applying rows that reference catalog exercises. |
| `src/data/foodCatalog.ts` | No JavaScript SHA-256 of APK-bundled files. Instead: exact size check, native `PRAGMA integrity_check`, schema version and food count. The archive's hashes are still verified at build time by `tests/foodCatalog.test.ts`. Network downloads keep full SHA-256. Inflate uses 64 KB slices with a yield to the UI; hashing uses 256 KB slices with a yield. **The starter catalog opens immediately** on first launch, and the complete catalog installs in the background and replaces it once verified. |
| `src/core/errors.ts` | Readable messages for `database is locked`, foreign-key failures and a session that is still starting. Used by the shared `message()` helper and by routine save. |
| `src/ui/components.tsx` | `Button` shows a spinner while its action is pending, stays locked against double taps, and always returns to interactive (existing `finally`). |
| `src/app/routine-form.tsx` | Validates only sets that still exist. On failure it shows **Routine not saved** with the real reason and **Try again / Keep editing**; the draft is untouched. It navigates only after the commit. |
| `src/ui/ExerciseBrowser.tsx` | Explicit "Preparing the exercise library…" and loading states. Errors show a **Try again** button that retries the import. A 20 s watchdog means it never spins forever. |
| `src/state/useScreenRevision.ts` and the 5 tab screens | Data reloads only while the tab is focused, with a single catch-up when you come back. |
| `src/state/sync.tsx` | The sync run after a change is debounced by 1.5 s. The 20 s interval is unchanged. |
| `src/app/workout-form.tsx` | Self-ticking `LiveTimer` and `RestTimer` components; the screen no longer re-renders every second. |
| `src/ui/SetRow.tsx` | `React.memo` that compares data props plus the parent exercise identity, so callbacks can never target a moved exercise. |

No new dependencies, schema migrations, Convex changes, package or signing changes, or AdMob/RevenueCat changes.

## 4. Date inputs (Day → Month → Year)

- **Component:** `src/ui/DateField.tsx`, with logic in `src/core/dateInput.ts`.
  - Three fields with a numeric keyboard, labelled **Day / Month / Year**.
  - Typing 2 digits for day moves to Month, 2 for month moves to Year, and 4 for year closes the field.
  - A single day digit 4–9 or month digit 2–9 is padded and advances at once ("5" → "05"). One-digit values are padded when you leave the field.
  - Backspace in an empty field moves to the previous field.
  - Pasting a full date into any field fills all three. Accepted forms: `DD/MM/YYYY`, `DD-MM-YYYY`, `DD.MM.YYYY`, ISO, `DDMMYYYY`, and `YYYYMMDD` when it starts with a plausible year.
- **Validation:** real calendar days, leap years ("2023 is not a leap year."), months 01–12, and per-feature limits.
- **Storage** is still `YYYY-MM-DD`; existing saved dates load unchanged.
- **Screens updated:**
  - Onboarding and Fitness Profile birthday, through the shared `BirthDateField` (1900 to today)
  - Weight entry (not in the future)
  - Body measurement (not in the future)
  - Habit start date
  - Manual workout date
  - Food entry date (not in the future)

## 5. Week calendars

- **Component:** `src/ui/WeekCalendar.tsx`, with logic in `src/core/weekCalendar.ts`.
  - Header: date range ("9 – Nov 15", with the year when the week crosses a year or isn't the current year), previous/next week buttons, and a Today link.
  - Seven Volt day pills with weekday and number, selected state, today shown with an accent outline, and per-day markers.
  - All maths uses local-noon dates via `fromDay`/`addDays`, so DST and UTC offsets never shift a day. Tests cover month, year and DST weeks.
- **Train:** current week by default; future weeks reachable; navigation never goes before the current week; past days in the current week are disabled. Tapping today or a future day opens the existing gym-day plan sheet. Markers show done, planned and rest. Stored plans (including for past weekdays) are untouched.
- **Nutrition:** previous weeks allowed; the next week is blocked at the current week; future days are disabled; "Back to today" link. The selected day loads its own totals and is passed to the food sheet, so backdated meals save under that day. The sheet also refuses future dates ("Meals can be logged for today or earlier."). Days with logged food get a dot.

## 6. Testing

- `npx tsc --noEmit`: passed.
- `npx expo lint`: clean.
- `npx vitest run`: **39 files, 275 passed, 1 skipped**. This includes **22 new** tests in `tests/performance-ux.test.ts` and 2 new / 1 updated in `tests/database-recovery.test.ts`. All earlier tests still pass.
- **Updated test, explained:** `database-recovery` previously asserted that a catalog import failure **fails the database open**, which was the design that caused B. It now asserts the intended behaviour: the open succeeds without the catalog, the catalog fails and then recovers on retry, and a failed *open* still closes and retries (the original intent, now triggered by a failing PRAGMA). A new test covers serialized writer transactions, including rollback.
- **Your list → coverage:**

| Your list | Covered by |
|---|---|
| 1–4 | Save success; rollback and retry after `database is locked`; double-tap and stale-text guards; oversized plan rejected with zero writes |
| 5–8 | Offline batched import; restart skips re-import and search plus empty results still work; resume after an interrupted import; static release assets and no JS hashing of bundled files; picker watchdog and retry |
| 9 | Serialized writer, focus-gated reloads, sync debounce, isolated timer, memoized rows (source and adapter checks) |
| 10–12 | Auto-advance, padding, paste, validation, leap years, use in every date field |
| 13–17 | Week maths across month, year and DST; Train and Nutrition rules; wiring; meals stored under the selected day |
| 18 | Existing account-isolation tests (database names, routine ownership) still pass |
| 19 | Calendar and date field use palette tokens only (no hex colours) |
| 20 | AdMob internal-build gate and subscriptions untouched; the existing subscription and ad tests pass |

- **Not run:** no on-device run (no device connected).
- **Expo Doctor:** 1 check fails, the existing 13 SDK patch-version mismatches. Dependencies intentionally not changed.

## 7. APK build

- **Result: built.** `npm run android:apk:preview` → `C:\Fit\builds\local\cubyfit-preview.apk` (147 MB, arm64-v8a), `BUILD SUCCESSFUL in 2m 49s`.
  - Package `com.bettereveryday.fitness`, versionName 1.0.0, versionCode 1.
  - Signer SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`. The signing configuration was not changed. The script's signature comparison with the installed app was not run because no device was connected.
- **The APK contains the new code:** its JavaScript bundle includes the WAL pragma, the friendly lock message and the future-meal guard.
- **First attempt failed:** Metro's worker reported `DataCloneError: Data cannot be cloned, out of memory` while bundling. A Sentry source-map upload step then failed only because no bundle had been produced.
  - **Assessment:** transient memory pressure on the build machine. The same dataset bundled successfully in today's two earlier builds and again on retry.
  - **Risk:** the 11.5 MB exercise JSON makes the bundling step memory-heavy. If this repeats, close other heavy apps before building or raise Node's memory limit for the build.
- **Not done:** no EAS build. Nothing was installed or uninstalled, and no app data was touched. Install it on the Redmi only if you want to; it is signed with the same key the build script has used for earlier preview APKs.

## 8. Remaining risks and next checks

1. **Device validation (most important).** On the Redmi, in both the dev client (`npx expo start --dev-client --clear`) and the new preview APK, check:
   - Routine save
   - Exercise library on first launch (look for "Preparing…" then results)
   - Exercise search
   - Adding and removing sets
   - Week navigation
   - Backdated meal logging
   - Date fields with the Android keyboard (auto-advance, Backspace)
   - General tap response

   Collect the `[perf]` lines from the dev client.
2. **Food catalog first launch:** the complete catalog still inflates 313 MB in JavaScript, now in the background and yielding to the UI. It is slower overall but no longer blocks food search. A native unzip would remove that cost and would need a native module, which I deferred.
3. **Foreign keys on the writer connection:** kept off, as before. Turning them on would newly reject some guest-import and cloud-restore rows that are accepted today. The two delete paths now remove child rows explicitly. Orphan rows created before this fix (from discarded workouts) are not cleaned up; they are invisible to the UI. A one-time, reviewed cleanup can be planned separately.
4. **WAL** is a one-time, persistent switch per account database and needs no migration. The database deletion helper already removes `-wal` and `-shm` files.
5. **PageReveal:** the tab-change reveal uses `MaskedView` in Android *software* rendering for about 550 ms. It wasn't measured and was left unchanged. If taps right after switching tabs still feel slow on the device, it is the next candidate.
6. **Translations:** new strings (date errors, calendar labels, retry texts) fall back to English in FR/AR until added to `i18n.ts`.
