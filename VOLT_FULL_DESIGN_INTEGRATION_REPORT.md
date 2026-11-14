# Cubyfit — Volt Full Design Integration Report

**Branch:** `working` (matches the pushed checkpoint `origin/working` @ `6e1769b` at the start of this work)
**State:** Changes are local and uncommitted. Nothing was committed, pushed, built or installed.

## Summary

The Volt prototype's final design is now the presentation layer for Home, the floating navigation, Nutrition, Habits, Train, Active Workout, Progress/Statistics, Weight, Missions, Motivation, Authentication and Onboarding. A shared native design kit (`src/ui/voltKit.tsx`) recreates the prototype's building blocks. Each one reads the Shore/Abyss palette from the theme context. All screens still use the existing repositories, services and Clerk/SQLite logic.

TypeScript, ESLint and the full test suite pass: 36 files, 226 tests passed and 1 skipped. That count includes 13 new design-integration tests.

**Main limitation:** I could not render or compare the native screens. The project has no `react-native-web`, no device was connected (`adb devices` was empty), and installing or building was out of scope. I compared the code against the prototype's measured CSS and against screenshots taken of the prototype in the browser. I make no pixel-match claims for the native app.

---

## A. Reference inspection

**How it was inspected**
- I served `Lastversion_Cubyfit.html` from a temporary local static server and opened it in the built-in browser. The phone frame was scaled so each screen fit at 375×812.
- **Screens captured and read:** Home, Train, Nutrition, Habits, Statistics/Progress (top and scrolled), Weight, Missions, Motivation, Active workout, History, Onboarding (intro and step 1) and Log in/Sign up. I also checked Abyss through the supplied screenshot and the theme switch.
- **Source read:** the final `v4`, `progress`, `r11`, `r12` and `r13` style blocks, plus the `Home`, `QuadRing`/`SqRings`, `Horseshoe`, `DayPills`, `UpNext` and `CubyMark` components. Base64 images were stripped first so the CSS and JS could be read.

**Final effective styles identified.** Later blocks override earlier ones; I used the last effective `html.t-shore` and `html.t-abyss` declarations.

| Token | Shore | Abyss |
|---|---|---|
| bg / surface / elev | `#F5F9FF` / `#FFFFFF` / `#EEF6FF` | `#000000` / `#0B0E1A` / `#141A2E` |
| fg / mute | `#0B1446` / `#4A5679` | `#EEF6FF` / `#A8B0C8` |
| g1 → g2 (pills, primary, check) | `#1D2E8F` → `#0B1446` | `#DFFF1F` → `#9CCBFF` |
| q1 / q2 / q3 (rings) | navy / `#9CCBFF` / lime | lime / `#9CCBFF` / `#C9E3FF` |
| c8 card / line | `#FFFFFF` / `#E4EEFB` | `#0B0E1A` / `rgba(255,255,255,.06)` |
| soft1 / soft2 | `#EEF6FF` / `#F6FFC2` | blue 12% / lime 10% |
| Nav bar / active tab | white 90% · navy pill, white text, lime icon | `rgba(11,14,26,.94)` · lime pill, navy text |
| Fonts | Bricolage Grotesque (display) + Figtree (UI); already bundled | same |
| Motion curves | `--out cubic-bezier(.22,1,.36,1)`, `--spring cubic-bezier(.34,1.56,.64,1)` | same |

Screen gutter: 18px. Cards: radius 26 and padding 16. Rows: radius 20. Section titles: 17px. Page titles: 41px with an accent full stop.

**Animations identified:**
- Nav pill grows to flex 2.7.
- Ring and gauge strokes draw in (1.1–1.3s, staggered by 120ms).
- Horseshoe badge fades in after the arc.
- Bars and progress bars grow.
- Rows enter with `pgIn` (6px rise and fade).
- Underline tabs slide.
- Segmented thumb slides.
- Gallery cards scale to 0.96 and fade when inactive.
- Buttons scale on press.
- Day pills pop when selected.
- Sheets slide up.
- Decorative: logo blink, orbit, floating art, panning pattern.
- Habits: swipe rows (excluded).
- Lite mode and reduced motion disable decoration.

### Navigation map

| Prototype screen | RN route | Data / logic reused | Interaction |
|---|---|---|---|
| Home | `(tabs)/index` | `repo.habits/completions/habitProgress/missions/manual/trainingWorkouts/weights/routines/routineExercises/openWorkoutSession`, `nutritionEnabled/Target`, `foodEntries` | Day pills, calendar sheet, Up-next check → `setHabitCompletion`/`setHabitAmount`, workout card → `workout-form`, meal card → `FoodSheet` |
| Train | `(tabs)/workouts` | `repo.workouts/trainingWorkouts/routines/routineExercises/exercises/restDays/openWorkoutSession`, `toggleRest`, `remove` | Gallery → start routine; ⋯ → start/edit/delete; history row → open/delete |
| Active workout | `workout-form` | Unchanged session/timer/save logic, `interstitialManager` | Pause/resume, Finish sheet, set check, add/remove set/exercise |
| History | Section inside Train | `trainingWorkouts`, `workouts` | Open/delete session |
| Nutrition | `(tabs)/nutrition` | `foodEntries`, `nutritionTarget`, `customFoods`, `prepareFoodCatalog`, `FoodSheet`, `TargetsSheet` | Meal row → add, or expand and edit entries; "See all" → week stats |
| Habits | `(tabs)/habits`, `habit-form`, `habit-history` | `repo.setHabitCompletion/setHabitAmount/moveHabit/remove`, `reconcileReminders`, `weeklyConsistency` | Tap check, ⋯ action sheet (done/undo, +amount, set total, reset, edit, history, move, delete) |
| Statistics / Progress | `(tabs)/progress` | `habitRate`, `weightSummary`, `weightGoalProgress`, `personalRecords`, `missionProgress` | Day/Week/Month/Year tabs, period arrows, tap a bar, habit → history |
| Weight / measurements | `weight`, `weight-form`, `measurement-form` | `repo.weights/measurements/remove` | Range 7/30/90, tap point, row → edit/delete sheet |
| Missions | `missions`, `mission-form` | `missionProgress`, `setMissionCompletion`, `setWeeklyMissionCompletion` | Ring toggles manual missions; card → complete/edit/delete |
| Motivation | `motivation` | `cards`, `repo.favorites/toggleFavorite`, `Share` | Discover/Saved, category chips, prev/heart/share/next |
| Auth | `(auth)/*` | Clerk `useSignIn/useSignUp`, `SocialAuth` (unchanged logic) | Unchanged flows |
| Onboarding | `onboarding` | `repo.createProfile`, validation (unchanged) | Step bar, goal option cards |
| Profile / Account | `(tabs)/profile`, `account`, … | Unchanged | Unchanged (Exception A) |

---

## B. Screens implemented

| Screen | Visual integration | Existing features | Navigation | Animation | Remaining differences |
|---|---|---|---|---|---|
| **Home** | Rebuilt to the prototype layout: logo + greeting + avatar, month chip, 7 gradient day pills, Daily progress card (nested square rings 124px + 38px percent + legend), 4 shortcut tiles, Up-next row, workout and meal duo cards, dashed daily quote | Real data only; no sample values. Daily % is the prototype's average of the available rings (calories or missions, habits, workout) | Avatar → `/account` (kept). Shortcuts → tabs. Missions/Weight/Motivation reachable through a compact row (the prototype reaches them from its desktop side panel) | Rings draw in with stagger, card fades up, press scale, pill pop | Avatar initial instead of a photo. "Today's habits" grid removed (Up-next and Habits tab cover it) |
| **Floating nav** | 12px inset, 54px tall, radius 28, 44px tabs, active flex 2.7, Shore navy/lime and Abyss lime/navy, bar-chart icon | Unchanged routing | 5 tabs, Profile is secondary | Existing spring pill, active shadow | Glow ellipse under the bar not drawn |
| **Nutrition** | Eyebrow + targets button, 41px title, day pills, Calories card with **Horseshoe gauge** (rim/track/gradient arc, dotted rail, % badge, flame), 3 macro chips, `.row8` meal rows, "See all" week view (bars, KPIs, trio) | Food search, full catalog, portions, editing, targets, tracking-off state, attribution all kept | Back chip "Summary" returns from the week view | Arc draws (1.3s), badge fades in, bars grow, rows enter, meal expand/collapse | Liquid "vessel" visuals retired (not in the final prototype) |
| **Habits** | Eyebrow + add, title + "n/m done", segmented day bar, week strip with level ticks, **Schedule** timeline (time, capsule, label, round check, ⋯) with a "Now" marker, **Anytime** list, weekly consistency card | All actions kept: complete/undo, quantity +increment, set total, reset, edit, history, reorder, delete, category filter | Habit form/history routes | Row entrance, press feedback, bar fills. **No swipe/drag** (Exception B) | Capsules don't stretch by duration (habits have no duration field); prototype "Manage" screen not separate |
| **Train** | Eyebrow "n sessions this week", week strip, snap **routine gallery** (82% cards, coloured cover, play button, dots), exercise list for the focused routine, History trio + date-block rows | Start routine, empty workout, rest day, edit/delete routine, open/delete sessions, in-progress card | ⋯ sheet per routine | Inactive cards scale to 0.96 / 75% opacity, entrance stagger | No category chips (routines have no category). No sets/reps/kg targets per routine exercise in the data model, so rows show the metric instead. Cover art is an icon, not illustrations |
| **Active workout** | Centred timer + Finish pill, status line, Pause/Resume, trio (Sets/Volume/Exercises), exercise header with set count, set rows with pill inputs and round check, dashed "Add set" | Timer/session persistence, save/finish/discard, interstitial hook unchanged | Unchanged | Press scale and check pop | No "PREV" column (previous-set lookup is not exposed by the current data API). Bottom actions stay in the scroll, not pinned |
| **Progress** | Navy **weight card** (KPIs, All/Month/Week, tappable smooth line, lime last point), underline Day/Week/Month/Year tabs, period arrows, 78px hero with delta, KPI row, bar chart (today lime), By-habit bars, "Worth knowing" insights, More links, Records | Existing `habitRate`/weight/record calculations, scoped to the visible range for performance (same results) | Weight card → `/weight`, habit → history, Missions link | Tab indicator slide, hero fade, bar growth stagger, bar fills | "Food" section not added (would need per-day target queries). Year bars are monthly |
| **Weight** | 88px number + KG, change line, 7D/30D/90D segmented, selected reading + "vs prev", area + smooth line chart with right axis, goal bar + %, Start/Target/To-go trio, weigh-in list, measurements list | Add weight/measurement, edit/delete via sheet | Back circle | Hero fade, segmented thumb, bar fill | Chart dates show three labels |
| **Missions** | 78px "done/total" hero, Today / This week cards with progress rings, LOGGED badge, weekly bar + days left | Manual toggle, edit, delete, activity missions | Sheet per mission | Entrance stagger, press | — |
| **Motivation** | Discover/Saved segmented, category chips, dotted poster card, round prev/heart/share/next controls | Favorites, share, filters | — | Cross-fade between cards | Swipe on the card not implemented (arrows only); highlighted words not supported by the card data |
| **Auth** | Logo header, nested square arcs backdrop, 44px title, Volt Apple (ink) / Google (outlined) pills, welcome toggle | Clerk, Google/Apple, email verification, reset, session logic untouched | Unchanged | Press scale on social buttons | "Explore first" guest mode and the inline email+arrow field are not implemented (the app has no guest mode) |
| **Onboarding** | Segmented 4-step bar, "STEP n OF 4", goal option cards with icons and check | Same validation and profile creation | Unchanged | Option pop | Prototype intro orbit screen not reproduced |
| **Shared** | Cards, buttons (navy/lime primary), inputs, sheets (22px title, 36px close), section headers, progress bars | — | Back button is a 36px circle with an inline 22px title | Sheet slide (existing) | Faint graffiti background pattern not added (see F) |

---

## C. Explicit exceptions

- **Profile and Account Settings preserved:** `profile.tsx`, `account.tsx`, `admob-testing.tsx`, `premium-test.tsx`, `cloud-sync.tsx` and `delete-account.tsx` have no source changes (`git diff` is empty for them). They only pick up the shared tokens through the common `Page`, `Card` and `Button` components.
- **Habits sliding/swiping excluded:** Habits uses only taps: a round check button and a ⋯ action sheet. A test asserts there is no `PanResponder`, `Swipeable`, `GestureDetector`, `Gesture.Pan` or touch-move handlers.

## D. Technical changes

**New:**
- `src/ui/voltKit.tsx`: VCard, ScreenTop, PageTitle, CircleButton, IconBox, VChip, SectionLink, ListRow, RowValue, PlusDot, DayPills, SquareRings, Horseshoe, MiniBar, HeroNumber, StatTrio, UnderlineTabs, Segmented, EmptyAction, KpiRow and an entrance hook.
- `src/ui/CubyMark.tsx`: the real vector logo from the prototype.
- `src/core/voltGeometry.ts`: pure ring and gauge geometry, plus the daily-percent average.
- `tests/volt-design-integration.test.ts`

**Modified:**
- `theme.ts`: prototype tokens added. The Abyss nav background was corrected from navy to `rgba(11,14,26,.94)`. The Deep nav active state is now lime.
- `components.tsx`: Page header structure, 18px gutter, 12px rhythm, card border, primary button colour.
- `BottomSheet`, `visuals` (SectionHeader, ProgressBar), `WorkoutSetRow`, `WorkoutInProgressCard`, `auth`, `SocialAuth` (button style only), `(tabs)/_layout`.
- Screens: Home, Nutrition, Habits, Train, Progress, Weight, Missions, Motivation, workout-form (presentation only), onboarding (presentation only), welcome (toggle colours).

**Removed (no remaining references):**
- `src/ui/NutritionVisuals.tsx` and `src/ui/DisplayMetric.tsx`
- Unused `VoltProgressRings`/`VoltIconTile` in `volt.tsx`
- Unused `TickDial`, `TransformationRuler`, `HabitCheck`, `FavoriteButton` and `MotivationCard` in `visuals.tsx`

**Routes:** none added or removed. All `Stack.Screen` registrations are unchanged.
**Services reused:** the repositories, nutrition data, reminders, Clerk, the interstitial manager and the logic helpers.
**Dependencies added:** none. Everything uses the existing `react-native-svg`, `react-native-reanimated` and `@expo/vector-icons`.
**Backend changes:** none. No changes to SQLite schema or migrations, Convex, RevenueCat, AdMob/UMP, Sentry, notifications, native config, app identifiers or `C:\Fit-Legal`.

## E. Verification

- **TypeScript:** `npx tsc --noEmit` passed.
- **ESLint:** `npx expo lint` passed with no warnings.
- **Automated tests:** `npx vitest run`: 36 files, 226 passed, 1 skipped. This includes the existing theme-persistence, navigation, account-navigation, auth (Apple/Google), AdMob and schema/sync tests.
- **New tests (13):**
  - Shore/Abyss prototype tokens
  - No legacy concept colours
  - Ring and horseshoe geometry
  - Daily-percent averaging
  - Habits is tap-only and still wired to the repository
  - Home uses real repos and has no sample data
  - Nutrition, Train and Active workout keep their existing flows
  - Reduced-motion use in the kit
- **Visual comparison:** done against the prototype as rendered in the browser and its CSS values. **The native screens were not rendered**: there is no web renderer in the project, no device or emulator was connected, and building or installing was out of scope. Spacing, overflow, font metrics and Android shadows still need on-device review.
- **Navigation tests:** the source-level route assertions pass. Runtime navigation was not exercised.
- **Runtime/device verification:** not performed.

## F. Remaining work

1. **Device visual QA (high priority).** Check both themes on the Redmi, especially:
   - Home ring sizes
   - Gallery snapping
   - Horseshoe text overlap on narrow screens (under 360dp)
   - Bottom-nav clearance
   - Android elevation on Shore cards
   - Sheet keyboard behaviour
2. **Unfinished visual details:**
   - Graffiti background pattern (needs a bundled mask image; skipped for memory and performance)
   - Nav-bar glow
   - Habit capsule height by duration
   - Workout "PREV" column
   - Exercise targets in the Train list
   - Motivation highlighted words
   - Profile avatar photo
3. **Missing animations:**
   - Logo blink
   - Onboarding orbit
   - Floating gallery art and panning pattern (all continuous and decorative)
   - Card swipe in Motivation
   - The prototype's in-page screen slide transitions. The existing circular `PageReveal` for tab changes was kept.
4. **Unsupported prototype interactions** (left unimplemented rather than faked):
   - "Explore first" guest mode
   - Inline email+arrow sign-in
   - Biometrics previews
   - Workout category filters
   - Saved/bookmarked workouts
   - Auto (system) appearance
   - Lite-mode toggle (system reduced motion is respected instead)
   - Progress "Food" section
   - Habit undo toast
5. **Localization:** new UI copy (for example "Up next", "Worth knowing", "Weigh-ins") has no FR/AR entries in `src/core/i18n.ts` yet, so it falls back to English.
6. **Performance to watch:**
   - Progress Month/Year computes per-day rates. Completions are now scoped to the range, but this should still be profiled on a low-end device.
   - Each `SquareRings` and `Horseshoe` runs a short one-off animation. No continuous animations were added.

## G. Next milestone: standalone APK

- No native module, plugin or config changed. A Metro-connected development client can show these JavaScript changes directly once you start Metro.
- The installed standalone preview APK does **not** contain this code. Testing it standalone needs a new local preview build (`npm run android:apk:preview`) and your approval to install it. No EAS build is needed.
- Before building:
  1. Review and commit the changes.
  2. Run the device checklist in F.1.
  3. Add the FR/AR strings.
  4. Re-run `tsc`, `expo lint` and `vitest`.
