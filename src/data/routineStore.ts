/**
 * Routine persistence on top of the existing tables:
 * - `routines` / `routine_exercises` keep the routine and its exercise order (unchanged schema);
 * - planned sets live in the synced `preferences` table under `training.routine-sets.v1:<id>`;
 * - the weekly gym-day plan (`training.weekly-plan.v1`) is cleaned when a routine is deleted.
 * Completed workouts never reference routines, so deleting a routine keeps all history.
 * Functions take the database handle so they run inside one transaction and are unit-testable.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import { uid } from '../core/date';
import { gymSchedulePreferenceKey, parseGymSchedule, serializeGymSchedule } from '../core/gymSchedule';
import { blankTarget, decodeRoutineTargets, encodeRoutineTargets, routineDraftFrom, routineSetsPreferenceKey, validateRoutineDraft, type RoutineDraft, type TargetSet } from '../core/routineDraft';
import type { Routine, RoutineExercise, WorkoutExercise, WorkoutSet } from '../core/types';
import { assertMayCreate, type FeatureAccess } from '../services/featureLimits';

type Tx = Pick<SQLiteDatabase, 'runAsync' | 'getFirstAsync' | 'getAllAsync'>;
type Db = Pick<SQLiteDatabase, 'withExclusiveTransactionAsync' | 'getFirstAsync' | 'getAllAsync'>;

async function ownedRoutine(tx: Tx, ownerId: string, routineId: string) {
  const routine = await tx.getFirstAsync<Routine>('SELECT * FROM routines WHERE id=?', routineId);
  if (routine && routine.owner_id !== ownerId) throw Error('Routine not found for this account.');
  return routine;
}

/** Creates or updates a routine, its exercise order and its planned sets in one transaction. */
export async function saveRoutineDraft(database: Db, ownerId: string, draft: RoutineDraft, names: ReadonlyMap<string, string> | undefined, access: FeatureAccess): Promise<string> {
  validateRoutineDraft(draft, names);
  const routineId = draft.id ?? uid();
  await database.withExclusiveTransactionAsync(async tx => {
    const existing = await ownedRoutine(tx, ownerId, routineId);
    if (draft.id && !existing) throw Error('This routine was deleted. Go back and create it again.');
    // Creation is checked with the insert under one exclusive transaction. Existing routines
    // remain editable after expiry or when an account already has more than the Free allowance.
    if (!existing) {
      const saved = await tx.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM routines WHERE owner_id=?', ownerId);
      assertMayCreate('routines', saved?.n ?? 0, access);
    }
    await tx.runAsync('INSERT INTO routines VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name', routineId, ownerId, draft.name.trim(), existing?.created_at ?? new Date().toISOString());
    await tx.runAsync('DELETE FROM routine_exercises WHERE routine_id=?', routineId);
    for (const [position, item] of draft.exercises.entries()) await tx.runAsync('INSERT INTO routine_exercises VALUES (?,?,?,?)', uid(), routineId, item.exerciseId, position);
    await tx.runAsync('INSERT OR REPLACE INTO preferences VALUES (?,?)', routineSetsPreferenceKey(routineId), encodeRoutineTargets(draft.exercises));
  });
  return routineId;
}

/**
 * Deletes a routine and its planned configuration, and removes it from any weekly gym day.
 * Workouts started from the routine are separate records and are not touched.
 */
export async function deleteRoutine(database: Db, ownerId: string, routineId: string) {
  await database.withExclusiveTransactionAsync(async tx => {
    const routine = await ownedRoutine(tx, ownerId, routineId);
    if (!routine) return;
    // Explicit child delete: exclusive-transaction connections do not run ON DELETE CASCADE.
    await tx.runAsync('DELETE FROM routine_exercises WHERE routine_id=?', routineId);
    await tx.runAsync('DELETE FROM routines WHERE id=? AND owner_id=?', routineId, ownerId);
    await tx.runAsync('DELETE FROM preferences WHERE key=?', routineSetsPreferenceKey(routineId));
    const plan = await tx.getFirstAsync<{ value: string }>('SELECT value FROM preferences WHERE key=?', gymSchedulePreferenceKey);
    if (plan) {
      const current = parseGymSchedule(plan.value);
      const kept = current.filter(item => item.kind !== 'routine' || item.routineId !== routineId);
      if (kept.length !== current.length) await tx.runAsync('INSERT OR REPLACE INTO preferences VALUES (?,?)', gymSchedulePreferenceKey, serializeGymSchedule(kept));
    }
  });
}

/** Loads an editable draft for an existing routine (planned sets default to one blank set). */
export async function loadRoutineDraft(database: Db, ownerId: string, routineId: string): Promise<RoutineDraft | null> {
  const routine = await database.getFirstAsync<Routine>('SELECT * FROM routines WHERE id=? AND owner_id=?', routineId, ownerId);
  if (!routine) return null;
  const links = await database.getAllAsync<RoutineExercise>('SELECT * FROM routine_exercises WHERE routine_id=? ORDER BY position', routineId);
  const targets = await database.getFirstAsync<{ value: string }>('SELECT value FROM preferences WHERE key=?', routineSetsPreferenceKey(routineId));
  return routineDraftFrom(routine, links.map(link => link.exercise_id), targets?.value);
}

/** Planned sets per routine position, for the Train list and session creation. */
export async function routinePlannedSets(tx: Tx, routineId: string, exerciseIds: readonly string[]): Promise<TargetSet[][]> {
  const targets = await tx.getFirstAsync<{ value: string }>('SELECT value FROM preferences WHERE key=?', routineSetsPreferenceKey(routineId));
  return decodeRoutineTargets(targets?.value, exerciseIds).map(sets => sets.length ? sets : [blankTarget()]);
}

/**
 * Inserts a new session's exercises and sets from a routine's plan. Planned reps/weight are
 * prefilled but not completed, so they never count toward volume until the user checks them.
 */
export async function insertRoutineSessionExercises(tx: Tx, workoutId: string, routineId: string, links: readonly RoutineExercise[]) {
  const planned = await routinePlannedSets(tx, routineId, links.map(link => link.exercise_id));
  const exercises: { link: WorkoutExercise; sets: WorkoutSet[] }[] = [];
  for (const [position, source] of links.entries()) {
    const link: WorkoutExercise = { id: uid(), workout_id: workoutId, exercise_id: source.exercise_id, position };
    await tx.runAsync('INSERT INTO workout_exercises VALUES (?,?,?,?)', link.id, link.workout_id, link.exercise_id, link.position);
    const sets: WorkoutSet[] = [];
    for (const [index, target] of planned[position].entries()) {
      const set: WorkoutSet = { id: uid(), workout_exercise_id: link.id, set_number: index + 1, reps: target.reps, weight_kg: target.weightKg, duration_sec: target.durationSec, note: '', completed: 0 };
      await tx.runAsync('INSERT INTO workout_sets (id,workout_exercise_id,set_number,reps,weight_kg,duration_sec,note,completed) VALUES (?,?,?,?,?,?,?,?)', set.id, set.workout_exercise_id, set.set_number, set.reps, set.weight_kg, set.duration_sec, set.note, 0);
      sets.push(set);
    }
    exercises.push({ link, sets });
  }
  return exercises;
}
