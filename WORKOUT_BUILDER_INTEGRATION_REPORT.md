# Cubyfit — Workout Routine Builder & Active Workout Integration Report

**Branch:** `working`. Starts from `d7670a2` plus your uncommitted exercise-library and gym-schedule work, which I kept and built on.
**State:** Nothing was committed, pushed, built or installed. The pending deletion of `exercises-dataset-main/` (from the library integration) was left as it was.

## Summary

The full flow now runs on the existing SQLite repositories:

Create routine → name → add library exercises → plan sets (kg × reps or seconds) → reorder/remove → save → assign to a weekday → start → record sets → finish → history.

Results:
- TypeScript: passed.
- ESLint: clean.
- Tests: 38 files, 251 passed, 1 skipped. This includes **21 new** tests in `tests/workout-builder.test.ts`.

The native screens were **not** rendered on a device or emulator. Layout fit on narrow screens was checked with arithmetic tests, not screenshots.

---

## Architecture

**Reused without changes:**
- Tables: `routines`, `routine_exercises`, `workouts`, `workout_exercises`, `workout_sets`, `rest_days`, `preferences`, `exercise_catalog`
- Session persistence: `beginWorkoutSession`, `persistWorkoutSession`, `discardWorkoutSession`, `workoutSession`
- The workout timer, the interstitial hook and the weekly plan model in `gymSchedule.ts`

**Data-model decision: planned sets.** The schema had no place for per-routine set targets, and Convex sync only accepts the existing record kinds. A new table would have stayed on the device only, which you asked me to avoid. Instead:
- **Storage:** each routine's planned sets are stored as compact JSON in the existing, already-synced `preferences` table under `training.routine-sets.v1:<routineId>`.
  - Format: `{"v":1,"x":[[exerciseId,[[reps,kg,sec],…]],…]}`, aligned with exercise order.
  - This is the same path the weekly plan (`training.weekly-plan.v1`) already uses.
- **What this avoids:** no migration, no schema change and no Convex change.
- **Size limit:** Convex caps a record field at 2,000 characters. The app refuses to save above 1,900 and shows a clear message. That is roughly 15–25 exercises × 5 sets.
- **Mismatches:** an entry whose exercise doesn't match its position is ignored, and that exercise falls back to one blank set.

**New modules:**
- `src/core/routineDraft.ts` (pure):
  - Draft operations: add with accidental-duplicate guard, replace, remove, move, add/remove/update set
  - Input parsing, validation, encode/decode, unsaved-change comparison
  - Workout totals, previous performance, rest-timer maths, set-row column widths
- `src/data/routineStore.ts`: all routine database work, each step in a single transaction:
  - `saveRoutineDraft`
  - `loadRoutineDraft`
  - `deleteRoutine` (also removes the planned sets and clears the routine from weekly-plan days)
  - `insertRoutineSessionExercises` (creates the session's sets from the plan)
- `src/ui/SetRow.tsx`: the compact set row, the column header row and the dashed "Add set" row.
- `gymSchedule.ts`: new `resolveDayPlan`. A one-off rest day wins over the weekly plan, and a day pointing at a deleted routine shows as "no plan".

**Changes to existing code:**
- `db.ts`:
  - `beginWorkoutSession` now creates sets from the routine plan. Values are prefilled, `completed = 0`, and it still falls back to one blank set.
  - Added `repo.routineDraft`, `saveRoutineDraft`, `deleteRoutine` and `exerciseMuscles`.
- `components.Page`: optional `footer` (sticky bottom bar), `headerContent` and `onBack`.
- `voltKit`: `MenuItem`.

**Removed:** `src/ui/WorkoutSetRow.tsx`, replaced by `SetRow`.

**Exercise library:** the text-only catalog is used through `repo.searchExercises`, `exerciseFilters` and `exerciseDetail`, with stable `catalog:<id>` IDs. There are no images or placeholders. Muscle groups come from `exercise_catalog`.

## Features implemented

| Area | Behaviour |
|---|---|
| **Create routine** | Train → "My routines · New" (or +). Large name field with inline validation. Exercise cards with numbered badge, name and muscle group. "Add exercise" dashed row. Sticky **Cancel / Save routine**. A save-in-progress guard stops double saves. |
| **Exercise picker** | Pill search (150 ms debounce), muscle chips, equipment and category behind "Equipment & category", "Clear filters", inline expandable details (category, equipment, target, secondary muscles, steps). A 700 ms tap lock stops accidental double adds. The builder's draft stays in memory while the picker is open. |
| **Duplicates** | Picking an exercise that's already present shows a dialog: **Cancel / Add again**. Replace refuses duplicates. |
| **Exercise management** | `⋯` menu: Move up, Move down, Replace, Remove. No confirmation in the builder, because nothing is saved until Save. In a live workout, removing an exercise with completed sets asks first. |
| **Sets (builder)** | Compact rows: set # with remove, KG, REPS (or SEC). "Add set" copies the previous targets. Removing renumbers the rest and keeps their values. An exercise with no sets shows an empty state, and saving tells you which exercise needs a set. Max 20 sets per exercise. |
| **Edit / cancel** | Back or Cancel with unsaved changes asks **Keep editing / Discard** (`usePreventRemove`). With no changes it leaves without asking. |
| **Delete routine** | Trash icon in the builder, or "Delete routine" in Train's menu. The confirmation names the routine. It removes the routine, its exercise order and its planned sets, and clears it from weekly-plan days. **Completed workouts are untouched** (covered by a test). |
| **Gym-day planning** | Tap a day in Train's week strip. The plan sheet lists routines (with exercise and set counts), **Weekly rest day** and **No plan**, plus **Rest on this date only** for today and future dates. Each option shows a check when selected, and you can **Start** from it. Train shows a "Planned today" card with a play button, or a Rest-day card. Gallery cards show "Every Mon, Thu". Home's workout card follows today's plan ("Planned · n exercises" or "Rest day"). A routine planned on several days is one routine, so editing it changes every day. |
| **Active workout** | Back (minimises; the session auto-saves), large timer, **Finish** pill, progress bar, routine name with Pause/Resume, Sets / Volume / Exercises tiles. Flat exercise blocks: 26px name, muscle group, done/total, `⋯` menu. Compact rows with previous performance, editable kg/reps and completion circle. "Add set" copies the last values. A **rest timer** (90 s, −15/+15, Skip) starts when you check off a set. Sticky **+ Exercise / ✓ Complete** bar. The finish sheet shows a summary, Finish workout, Save and Exit, Discard workout and Keep training. |
| **Statistics** | `workoutTotals` is the single source for the tiles, the progress bar and the finish sheet. Volume is completed weight × reps, matching the earlier formula. Unchecked sets never count. |
| **History** | Unchanged. Finishing uses the existing `persistWorkoutSession`, so history, records and Progress keep working. |

## Visual design

- **Compact set row:**
  - Follows the prototype's `.setrow` (`30px | prev | 74 | 74 | 38`, 8px gaps, pill cells).
  - Normal phones: set 50 · previous (flexible) · 70 · 70 · check 40, 7px gaps, 48px cells.
  - Below 360dp: 44 · flexible · 58 · 58 · 36, 5px gaps, 44px cells.
  - The remove control is a 20px "−" circle beside the set number with a larger invisible touch area. It sits next to the non-interactive previous column, so it's unlikely to hit another control.
  - Long-pressing the set number opens that set's note.
  - Tests confirm the previous column keeps at least 40dp at 320–412dp widths. No wrapping, no horizontal scroll.
- **Prototype fidelity:**
  - Checked against the prototype's Active screen source: header bar (back / timer / Finish), `.wprog`, routine label, `.astats`, `.exb` with dimmed upcoming and finished blocks (55% here vs 40–42% in the prototype, kept higher for legibility), `.addset`, `.dock` with Exercise / Complete.
  - Completed rows use the soft-lime cell fill; the focused input gets an accent border.
- **Animations (Reanimated; disabled under reduced motion):**
  - Exercise cards and set rows fade in, fade out and collapse smoothly (`LinearTransition`).
  - Press feedback on buttons, a pop on completion circles and on the check icon.
  - Sheets slide; the rest chip fades in and out; picker details fade in.
  - Nothing animates continuously. The rest timer ticks only while it's visible.
- **Shore / Abyss:** all new UI reads the theme palette:
  - Inputs: `soft1` (Shore) or `card2` (Abyss)
  - Done cells: soft lime (Shore) or lime at 16% (Abyss)
  - Check and primary actions: navy (Shore) or lime (Abyss)
  - Dividers: `border`
  - The rest chip uses the hero navy and turns lime when time is up.
  - A test bans the legacy concept colours.

## Testing

- `npx tsc --noEmit`: passed.
- `npx expo lint`: clean.
- `npx vitest run`: 38 files, 251 passed, 1 skipped.
- **New tests**, against a real in-memory SQLite with the app's migrations:

| Your list | Covered by |
|---|---|
| 1–3, 6–9 | Create, add one or several exercises, duplicate guard, add set (copies values), remove set with renumbering, kg/reps parsing and validation |
| 4–5 | Remove and reorder exercises |
| 10, 13 | Save routine; history kept after deleting a routine (SQLite) |
| 11 | Cancel/discard change detection (keys ignored, real edits detected) |
| 12 | Delete routine, plus cleanup of planned sets and schedule references |
| 14–16 | Assign, change and remove a weekday routine; one-off rest priority; stale reference; starting a scheduled routine creates prefilled, uncompleted sets |
| 17–21 | Totals after adding an exercise, removing a set or marking sets complete; volume rules; finish/restore source checks |
| 23 | Account isolation: another account can't load, edit or delete the routine |
| 24–25 | Theme-token and reduced-motion source checks; narrow-width fit maths |

- **Not covered:**
  - Rendering tests (there's no React Native renderer in the test setup).
  - Runtime navigation.
  - Real device persistence after restarting the app.

## Remaining work

1. **Device check (most important).** Verify on the Redmi, in both themes:
   - Set rows at the phone's real width and font scale
   - Keyboard behaviour with the sticky bottom bar
   - The "Discard changes?" prompt on Android back gesture and button
   - Exercise picker sheet height
   - Rest-timer visibility while scrolled
2. **Sync not verified.** Planned sets and weekly plans go through the existing preference sync. Their keys are new but the record kind (`preferences`) is not. I haven't run a round trip to Convex. Older app versions will ignore the new keys.
3. **Simplifications and UI differences:**
   - The rest timer is fixed at 90 s by default and isn't saved if the app is killed.
   - There are no per-exercise rest settings.
   - Drag-to-reorder isn't implemented (Move up/down menu instead).
   - Previous performance matches by set position from the last completed session that included the exercise.
4. **Copy:** new strings have no FR/AR translations in `i18n.ts` yet.
5. **Size limit:** very large routines hit the 1,900-character planned-set limit. Moving planned sets to a dedicated synced table would need a Convex schema/kind addition and a migration (backend work).

## APK

No native module, plugin or config changed. A Metro-connected development build can show this immediately. The installed standalone preview APK does **not** include it, so a new local preview build (`npm run android:apk:preview`) is needed, and installing it needs your approval. No EAS build is needed.
