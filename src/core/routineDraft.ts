/**
 * Pure routine-builder and workout-set logic shared by the routine editor, the
 * active workout screen and the data layer. Nothing here touches storage or React.
 */
import type { Exercise, Workout, WorkoutExercise, WorkoutSet } from './types';

/** `key` is a UI-only identity for list animations; it is never persisted. */
export type TargetSet = { reps: number | null; weightKg: number | null; durationSec: number | null; key?: string };
export type RoutineDraftExercise = { key: string; exerciseId: string; sets: TargetSet[] };
export type RoutineDraft = { id: string | null; name: string; exercises: RoutineDraftExercise[] };

/** Preference key that stores a routine's planned sets (synced through the existing preferences path). */
export const routineSetsPreferencePrefix = 'training.routine-sets.v1:';
export const routineSetsPreferenceKey = (routineId: string) => routineSetsPreferencePrefix + routineId;
/** Cloud records cap string values at 2,000 characters; stay safely below it. */
export const ROUTINE_TARGETS_MAX_LENGTH = 1900;
export const MAX_SETS_PER_EXERCISE = 20;

let keySeed = 0;
export const draftKey = () => `rx-${Date.now().toString(36)}-${(keySeed++).toString(36)}`;
export const blankTarget = (): TargetSet => ({ reps: null, weightKg: null, durationSec: null, key: draftKey() });

export function emptyRoutineDraft(): RoutineDraft { return { id: null, name: '', exercises: [] }; }

/**
 * Adds an exercise. Accidental duplicates (double taps) are ignored unless the caller
 * explicitly allows the same exercise to appear twice.
 */
export function addExercise(draft: RoutineDraft, exerciseId: string, options: { allowDuplicate?: boolean; sets?: number } = {}): RoutineDraft {
  if (!exerciseId) return draft;
  if (!options.allowDuplicate && draft.exercises.some(item => item.exerciseId === exerciseId)) return draft;
  const count = Math.max(1, Math.min(MAX_SETS_PER_EXERCISE, options.sets ?? 3));
  return { ...draft, exercises: [...draft.exercises, { key: draftKey(), exerciseId, sets: Array.from({ length: count }, blankTarget) }] };
}

export function replaceExercise(draft: RoutineDraft, key: string, exerciseId: string): RoutineDraft {
  if (draft.exercises.some(item => item.key !== key && item.exerciseId === exerciseId)) return draft;
  return { ...draft, exercises: draft.exercises.map(item => item.key === key ? { ...item, exerciseId } : item) };
}

export function removeExercise(draft: RoutineDraft, key: string): RoutineDraft {
  return { ...draft, exercises: draft.exercises.filter(item => item.key !== key) };
}

export function moveExercise(draft: RoutineDraft, key: string, direction: -1 | 1): RoutineDraft {
  const from = draft.exercises.findIndex(item => item.key === key), to = from + direction;
  if (from < 0 || to < 0 || to >= draft.exercises.length) return draft;
  const exercises = [...draft.exercises];
  const [item] = exercises.splice(from, 1);
  exercises.splice(to, 0, item);
  return { ...draft, exercises };
}

/** New sets copy the previous set's targets so the user only adjusts what changes. */
export function addTargetSet(draft: RoutineDraft, key: string): RoutineDraft {
  return { ...draft, exercises: draft.exercises.map(item => item.key !== key || item.sets.length >= MAX_SETS_PER_EXERCISE ? item : { ...item, sets: [...item.sets, { ...(item.sets.at(-1) ?? blankTarget()), key: draftKey() }] }) };
}

export function removeTargetSet(draft: RoutineDraft, key: string, index: number): RoutineDraft {
  return { ...draft, exercises: draft.exercises.map(item => item.key === key ? { ...item, sets: removeAt(item.sets, index) } : item) };
}

export function updateTargetSet(draft: RoutineDraft, key: string, index: number, patch: Partial<TargetSet>): RoutineDraft {
  return { ...draft, exercises: draft.exercises.map(item => item.key === key ? { ...item, sets: item.sets.map((set, position) => position === index ? { ...set, ...patch } : set) } : item) };
}

/** Removes one entry by position; later entries keep their values and simply renumber. */
export function removeAt<T>(items: readonly T[], index: number): T[] {
  if (!Number.isInteger(index) || index < 0 || index >= items.length) return [...items];
  return items.filter((_, position) => position !== index);
}

/** Parses a numeric text field: '' → null, invalid → undefined (so callers can reject it). */
export function parseTargetNumber(text: string, kind: 'reps' | 'weight' | 'duration'): number | null | undefined {
  const trimmed = text.trim().replace(',', '.');
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return undefined;
  if (kind === 'weight') return value >= 0 && value <= 1000 ? Math.round(value * 100) / 100 : undefined;
  if (kind === 'reps') return Number.isInteger(value) && value >= 1 && value <= 1000 ? value : undefined;
  return Number.isInteger(value) && value >= 1 && value <= 86400 ? value : undefined;
}

export function validateRoutineDraft(draft: RoutineDraft, names: ReadonlyMap<string, string> = new Map()) {
  const name = draft.name.trim();
  if (!name) throw Error('Enter a routine name.');
  if (name.length > 80) throw Error('Routine names can be up to 80 characters.');
  for (const item of draft.exercises) {
    const label = names.get(item.exerciseId) ?? 'each exercise';
    if (!item.sets.length) throw Error(`Add at least one set to ${label}, or remove it.`);
    for (const set of item.sets) {
      if (set.reps !== null && (!Number.isInteger(set.reps) || set.reps < 1 || set.reps > 1000)) throw Error('Reps must be 1–1000.');
      if (set.weightKg !== null && (!Number.isFinite(set.weightKg) || set.weightKg < 0 || set.weightKg > 1000)) throw Error('Weight must be 0–1000 kg.');
      if (set.durationSec !== null && (!Number.isInteger(set.durationSec) || set.durationSec < 1 || set.durationSec > 86400)) throw Error('Set duration must be 1–86400 seconds.');
    }
  }
  const encoded = encodeRoutineTargets(draft.exercises);
  if (encoded.length > ROUTINE_TARGETS_MAX_LENGTH) throw Error('This routine has too many planned sets to save. Remove some sets or split it into two routines.');
}

/**
 * Compact, position-aligned encoding of a routine's planned sets:
 * `{"v":1,"x":[["exercise-id",[[reps,kg,sec],...]],...]}`.
 */
export function encodeRoutineTargets(exercises: readonly Pick<RoutineDraftExercise, 'exerciseId' | 'sets'>[]) {
  return JSON.stringify({ v: 1, x: exercises.map(item => [item.exerciseId, item.sets.map(set => [set.reps, set.weightKg, set.durationSec])]) });
}

/** Returns planned sets per routine position; entries that no longer match the exercise are ignored. */
export function decodeRoutineTargets(value: string | null | undefined, exerciseIds: readonly string[]): TargetSet[][] {
  const fallback = exerciseIds.map(() => [] as TargetSet[]);
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value) as { v?: unknown; x?: unknown };
    if (parsed?.v !== 1 || !Array.isArray(parsed.x)) return fallback;
    const number = (raw: unknown) => typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : null;
    return exerciseIds.map((exerciseId, index) => {
      const entry = (parsed.x as unknown[])[index];
      if (!Array.isArray(entry) || entry[0] !== exerciseId || !Array.isArray(entry[1])) return [];
      return (entry[1] as unknown[]).slice(0, MAX_SETS_PER_EXERCISE).filter(Array.isArray).map(row => ({ reps: number((row as unknown[])[0]), weightKg: number((row as unknown[])[1]), durationSec: number((row as unknown[])[2]), key: draftKey() }));
    });
  } catch { return fallback; }
}

export function routineDraftFrom(routine: { id: string; name: string }, exerciseIds: readonly string[], targets: string | null | undefined): RoutineDraft {
  const planned = decodeRoutineTargets(targets, exerciseIds);
  return { id: routine.id, name: routine.name, exercises: exerciseIds.map((exerciseId, index) => ({ key: draftKey(), exerciseId, sets: planned[index].length ? planned[index] : [blankTarget()] })) };
}

/** Structural equality used for the unsaved-changes guard (draft keys are ignored). */
export function sameRoutineDraft(a: RoutineDraft, b: RoutineDraft) {
  return a.name.trim() === b.name.trim() && encodeRoutineTargets(a.exercises) === encodeRoutineTargets(b.exercises);
}

export const plannedSetCount = (draft: RoutineDraft) => draft.exercises.reduce((sum, item) => sum + item.sets.length, 0);

// ---------------------------------------------------------------------------
// Active-workout statistics (one derivation used by the summary and the blocks).

export type SetLike = { reps: string; weight: string; completed: boolean };
export type ItemLike = { exerciseId: string; sets: SetLike[] };

/** Sets, completed sets, volume (completed weight × reps) and exercise count from one draft. */
export function workoutTotals(items: readonly ItemLike[]) {
  let total = 0, done = 0, volume = 0;
  for (const item of items) for (const set of item.sets) {
    total++;
    if (!set.completed) continue;
    done++;
    volume += (Number(set.weight) || 0) * (Number(set.reps) || 0);
  }
  return { totalSets: total, doneSets: done, volume: Math.round(volume * 100) / 100, exercises: items.length };
}

/** Index of the exercise the user is working on: the first with an unfinished set. */
export const activeExerciseIndex = (items: readonly ItemLike[]) => items.findIndex(item => item.sets.some(set => !set.completed));

/** Formats a stored set as compact "previous" text: `60 × 8`, `12 reps`, `45 s`. */
export function formatPreviousSet(set: Pick<WorkoutSet, 'reps' | 'weight_kg' | 'duration_sec'> | undefined, metric: Exercise['metric'] = 'weight_reps') {
  if (!set) return '—';
  if (metric === 'duration') return set.duration_sec ? `${set.duration_sec} s` : '—';
  if (metric === 'weight_reps' && set.weight_kg !== null && set.reps !== null) return `${+set.weight_kg.toFixed(2)} × ${set.reps}`;
  return set.reps !== null ? `${set.reps} reps` : '—';
}

/**
 * Most recent completed session's completed sets for each exercise, excluding the
 * current workout. Returned arrays are ordered by set number.
 */
export function previousPerformance(workouts: readonly Workout[], links: readonly WorkoutExercise[], sets: readonly WorkoutSet[], excludeWorkoutId?: string | null) {
  const completed = workouts.filter(workout => workout.completed && workout.id !== excludeWorkoutId)
    .sort((a, b) => b.day.localeCompare(a.day) || b.started_at.localeCompare(a.started_at));
  const order = new Map(completed.map((workout, index) => [workout.id, index]));
  const setsByLink = new Map<string, WorkoutSet[]>();
  for (const set of sets) if (set.completed) setsByLink.set(set.workout_exercise_id, [...(setsByLink.get(set.workout_exercise_id) ?? []), set]);
  const best = new Map<string, { rank: number; sets: WorkoutSet[] }>();
  for (const link of links) {
    const rank = order.get(link.workout_id);
    const linkSets = setsByLink.get(link.id);
    if (rank === undefined || !linkSets?.length) continue;
    const current = best.get(link.exercise_id);
    if (!current || rank < current.rank) best.set(link.exercise_id, { rank, sets: [...linkSets].sort((a, b) => a.set_number - b.set_number) });
  }
  return new Map([...best].map(([exerciseId, value]) => [exerciseId, value.sets]));
}

/** Rest timer remaining seconds from an absolute end time (no drift across re-renders). */
export const restRemaining = (endsAtMs: number | null, nowMs: number) => endsAtMs === null ? 0 : Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000));

// ---------------------------------------------------------------------------
// Compact set-row layout (prototype `.setrow`). Widths are in dp.

/** Column widths for a set row; narrow phones (< 360dp) get tighter, still-tappable columns. */
export function setRowColumns(screenWidth: number) {
  const compact = screenWidth < 360;
  return { compact, set: compact ? 44 : 50, cell: compact ? 58 : 70, check: compact ? 36 : 40, gap: compact ? 5 : 7, height: compact ? 44 : 48 };
}

/**
 * Width left for the "previous" column after the fixed columns, given the horizontal space
 * the row actually gets (screen width minus page gutters and any card padding).
 */
export function previousColumnWidth(screenWidth: number, horizontalInset: number, metric: Exercise['metric'] = 'weight_reps', live = true) {
  const c = setRowColumns(screenWidth);
  const cells = metric === 'weight_reps' ? 2 : 1;
  const columns = 1 + cells + (live ? 1 : 0) + 1; // set + inputs + check + previous
  const fixed = c.set + cells * c.cell + (live ? c.check : 0) + (columns - 1) * c.gap;
  return screenWidth - horizontalInset - fixed;
}
