import * as SQLite from 'expo-sqlite';
import { Exercise, Favorite, Habit, HabitCompletion, HabitProgress, Measurement, Mission, MissionCompletion, Preference, Profile, Routine, RoutineExercise, WeightEntry, Workout, WorkoutExercise, WorkoutSet } from '../core/types';
import { addDays, dayKey, uid } from '../core/date';
import { startWorkoutTimer } from '../core/workoutTimer';
import { exerciseSeeds, migrations } from './schema';
import { trainingWorkoutsQuery } from './queries';
import { localDatabaseName } from './account';
import { exerciseSearchQuery, importExerciseCatalog, normalizeExerciseText, type ExerciseDetail } from './exerciseCatalog';
import { deleteRoutine, insertRoutineSessionExercises, loadRoutineDraft, saveRoutineDraft } from './routineStore';
import type { RoutineDraft } from '../core/routineDraft';
import { reportFailure } from '../core/monitoring';
import { perfMark, perfNow } from '../core/perf';

let promise: Promise<SQLite.SQLiteDatabase> | undefined;
let activeAccount: string | null = null;
const connections = new Map<string, Promise<SQLite.SQLiteDatabase>>();
const removals = new Map<string, Promise<void>>();

// ---------------------------------------------------------------------------
// Write serialization.
//
// expo-sqlite opens a *new native connection* for every withExclusiveTransactionAsync call and
// documents that, once it writes, "other async write queries will abort with `database is
// locked`". The bundled SQLite has no busy timeout, no WAL and no default foreign keys, so
// overlapping writes (sync, reminders, a user save) failed immediately and cascades did not run
// inside those transactions. Every account database therefore:
//   1. uses WAL (readers never block the writer) and a 5 s busy timeout on all connections;
//   2. runs exclusive transactions one at a time on one long-lived writer connection with the busy
//      timeout (BEGIN IMMEDIATE takes the write lock up front).
// Foreign-key enforcement on the writer stays as before (off): turning it on would newly reject
// guest-import and cloud-restore rows that are accepted today. Deletes that need child rows removed
// do so explicitly.
const BUSY_TIMEOUT_MS = 5000;
type Writer = { name: string; connection: Promise<SQLite.SQLiteDatabase> | null; queue: Promise<unknown> };
const writers = new Map<string, Writer>();

async function openWriter(name: string) {
  const connection = await SQLite.openDatabaseAsync(name, { useNewConnection: true });
  await connection.execAsync(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS};`);
  return connection;
}

/** Runs `task` in a serialized IMMEDIATE transaction on the account's writer connection. */
function serializedTransaction(writer: Writer, task: (tx: SQLite.SQLiteDatabase) => Promise<void>): Promise<void> {
  const queuedAt = perfNow();
  const run = async () => {
    perfMark('write waited in queue', queuedAt, 50);
    const startedAt = perfNow();
    if (!writer.connection) writer.connection = openWriter(writer.name).catch(cause => { writer.connection = null; throw cause; });
    const tx = await writer.connection;
    await tx.execAsync('BEGIN IMMEDIATE');
    try {
      await task(tx);
      await tx.execAsync('COMMIT');
      perfMark('write transaction', startedAt, 50);
    } catch (cause) {
      try { await tx.execAsync('ROLLBACK'); } catch { /* SQLite may already have rolled back. */ }
      throw cause;
    }
  };
  const result = writer.queue.catch(() => undefined).then(run);
  writer.queue = result;
  return result;
}

async function closeWriter(name: string) {
  const writer = writers.get(name);
  writers.delete(name);
  if (!writer?.connection) return;
  await writer.queue.catch(() => undefined);
  await (await writer.connection.catch(() => null))?.closeAsync().catch(() => undefined);
}

export { storageErrorMessage } from '../core/errors';

export function setLocalAccount(userId: string | null) {
  if (userId !== null) localDatabaseName(userId);
  if (activeAccount !== userId) { activeAccount = userId; promise = userId ? connections.get(userId) : undefined; }
}
export function getLocalAccount() { return activeAccount; }

async function removeAccountDatabase(userId: string) {
  const name = localDatabaseName(userId);
  if (activeAccount === userId) { activeAccount = null; promise = undefined; }
  const connection = connections.get(userId);
  connections.delete(userId);
  await closeWriter(name);
  if (connection) await (await connection).closeAsync();
  catalogStates.delete(userId);
  await SQLite.deleteDatabaseAsync(name);
}

export function removeLocalAccountData(userId: string) {
  const existing = removals.get(userId);
  if (existing) return existing;
  const removal = removeAccountDatabase(userId).finally(() => { removals.delete(userId); });
  removals.set(userId, removal);
  return removal;
}

export async function db() {
  if (!activeAccount) throw new Error('Sign in before accessing local fitness data');
  const requestedAccount = activeAccount;
  if (!promise) {
    let attempt!: Promise<SQLite.SQLiteDatabase>;
    attempt = (async () => {
      const name = localDatabaseName(requestedAccount);
      const d = await SQLite.openDatabaseAsync(name);
      try {
        await d.execAsync(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}; PRAGMA foreign_keys = ON;`);
        // WAL is a persistent file property; readers then never block the single writer.
        await d.getFirstAsync('PRAGMA journal_mode = WAL');
        const row = await d.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
        for (let i = row?.user_version ?? 0; i < migrations.length; i++) {
          await d.withExclusiveTransactionAsync(async tx => { await tx.execAsync(migrations[i]); await tx.execAsync(`PRAGMA user_version = ${i + 1}`); });
        }
        await d.withExclusiveTransactionAsync(async tx => {
          for (const [id, name] of exerciseSeeds) await tx.runAsync('INSERT OR IGNORE INTO exercises VALUES (?,?,?,0)', id, name, id === 'plank' || id === 'running' ? 'duration' : id === 'pullup' ? 'reps' : 'weight_reps');
        });
        if (activeAccount !== requestedAccount) throw new Error('Account changed while opening local data');
        // From here on, every exclusive transaction is serialized on one writer connection.
        await closeWriter(name);
        const writer: Writer = { name, connection: null, queue: Promise.resolve() };
        writers.set(name, writer);
        d.withExclusiveTransactionAsync = task => serializedTransaction(writer, task as (tx: SQLite.SQLiteDatabase) => Promise<void>);
        // The ~1,300-exercise catalog imports in the background instead of blocking every query.
        scheduleCatalogImport(requestedAccount);
        return d;
      } catch (cause) {
        await d.closeAsync().catch(() => undefined);
        throw cause;
      }
    })().catch(cause => {
      if (connections.get(requestedAccount) === attempt) connections.delete(requestedAccount);
      if (activeAccount === requestedAccount && promise === attempt) promise = undefined;
      reportFailure('database-initialization', cause);
      throw cause;
    });
    promise = attempt;
    connections.set(requestedAccount, attempt);
  }
  return promise;
}
// ---------------------------------------------------------------------------
// Exercise catalog: imported once per catalog version, off the database-open critical path.

export type CatalogState = { status: 'idle' | 'loading' | 'ready' | 'error'; error: string | null };
const catalogStates = new Map<string, { state: CatalogState; promise: Promise<void> | null }>();
const catalogListeners = new Set<() => void>();
const notifyCatalog = () => { for (const listener of catalogListeners) listener(); };

const IDLE_CATALOG: CatalogState = Object.freeze({ status: 'idle', error: null });
/** Stable snapshot (same object until the state changes), safe for useSyncExternalStore. */
export function exerciseCatalogState(): CatalogState {
  return (activeAccount && catalogStates.get(activeAccount)?.state) || IDLE_CATALOG;
}
export function subscribeExerciseCatalog(listener: () => void) { catalogListeners.add(listener); return () => { catalogListeners.delete(listener); }; }

/** Resolves once the exercise catalog is available for the active account; retries after a failure. */
export function ensureExerciseCatalog(): Promise<void> {
  const account = activeAccount;
  if (!account) return Promise.reject(new Error('Sign in before accessing local fitness data'));
  const entry = catalogStates.get(account) ?? { state: { status: 'idle', error: null } as CatalogState, promise: null };
  catalogStates.set(account, entry);
  if (entry.state.status === 'ready') return Promise.resolve();
  if (entry.promise) return entry.promise;
  entry.state = { status: 'loading', error: null };
  notifyCatalog();
  const started = perfNow();
  entry.promise = (async () => {
    const database = await db();
    await importExerciseCatalog(database);
  })().then(() => {
    entry.state = { status: 'ready', error: null };
    perfMark('exercise catalog ready', started);
  }, cause => {
    entry.state = { status: 'error', error: 'The exercise library could not be prepared on this device.' };
    reportFailure('exercise-catalog', cause);
    throw cause;
  }).finally(() => { entry.promise = null; notifyCatalog(); });
  return entry.promise;
}

function scheduleCatalogImport(account: string) {
  // Let the first screen render and respond to taps before the import starts.
  setTimeout(() => { if (activeAccount === account) ensureExerciseCatalog().catch(() => undefined); }, 1500);
}

export async function all<T>(table: string, order = ''): Promise<T[]> { return (await db()).getAllAsync<T>(`SELECT * FROM ${table} ${order}`); }
export async function one<T>(table: string, id: string): Promise<T | null> { return (await db()).getFirstAsync<T>(`SELECT * FROM ${table} WHERE id = ?`, id); }
export async function put(table: string, record: Record<string, unknown>) { const cols = Object.keys(record); await (await db()).runAsync(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${cols.filter(c=>c!=='id').map(c=>`${c}=excluded.${c}`).join(',')}`, ...(Object.values(record) as (string | number | null)[])); }
export async function remove(table: string, id: string) { await (await db()).runAsync(`DELETE FROM ${table} WHERE id=?`, id); }

export type WorkoutBundle = { workout: Workout; exercises: { link: WorkoutExercise; sets: WorkoutSet[] }[] };
export type OpenWorkout = Workout & { total_sets: number; completed_sets: number };
async function workoutBundleFrom(queryable: Pick<SQLite.SQLiteDatabase, 'getFirstAsync' | 'getAllAsync'>, ownerId: string, workoutId: string): Promise<WorkoutBundle | null> {
  const workout = await queryable.getFirstAsync<Workout>('SELECT * FROM workouts WHERE id=? AND owner_id=?', workoutId, ownerId);
  if (!workout) return null;
  const links = await queryable.getAllAsync<WorkoutExercise>('SELECT * FROM workout_exercises WHERE workout_id=? ORDER BY position', workoutId);
  const sets = await queryable.getAllAsync<WorkoutSet>('SELECT s.* FROM workout_sets s JOIN workout_exercises e ON e.id=s.workout_exercise_id WHERE e.workout_id=? ORDER BY e.position,s.set_number', workoutId);
  return { workout, exercises: links.map(link => ({ link, sets: sets.filter(set => set.workout_exercise_id === link.id) })) };
}

export const repo = {
  one,
  remove,
  profile: async () => (await db()).getFirstAsync<Profile>('SELECT * FROM profile LIMIT 1'),
  saveProfile: async (p: Profile) => put('profile', p),
  createProfile: async (p: Profile) => { const d=await db(); await d.withExclusiveTransactionAsync(async tx=>{await tx.runAsync('INSERT INTO profile VALUES (?,?,?,?,?,?,?,?,?,?,?)',p.id,p.name,p.birth_date,p.height_cm,p.start_weight,p.target_weight,p.experience,p.fitness_goal,p.growth_goals,p.language,p.completed_at);await tx.runAsync('INSERT INTO weights VALUES (?,?,?,?,?,?)',uid(),p.id,dayKey(),p.start_weight,'Starting weight from onboarding',p.completed_at);}); },
  habits: () => all<Habit>('habits', 'ORDER BY sort_order, created_at DESC'),
  completions: () => all<HabitCompletion>('habit_completions'),
  habitProgress: () => all<HabitProgress>('habit_progress'),
  saveHabit: async (h: Habit) => {
    const d = await db();
    const existing = await d.getFirstAsync<{ sort_order: number }>('SELECT sort_order FROM habits WHERE id=? AND owner_id=?', h.id, h.owner_id);
    const next = existing ? existing.sort_order : (await d.getFirstAsync<{ n: number }>('SELECT COALESCE(MAX(sort_order),-1)+1 AS n FROM habits WHERE owner_id=?', h.owner_id))?.n ?? 0;
    await put('habits', { ...h, habit_type: h.habit_type ?? 'boolean', target_value: h.target_value ?? 1, unit: h.unit ?? '', increment: h.increment ?? 1, reminder_enabled: h.reminder_enabled ?? Number(!!h.reminder_time), reminder_times: h.reminder_times ?? JSON.stringify(h.reminder_time ? [h.reminder_time] : []), sort_order: h.sort_order ?? next });
  },
  moveHabit: async (id: string, direction: -1 | 1) => {
    const d = await db();
    await d.withExclusiveTransactionAsync(async tx => {
      const current = await tx.getFirstAsync<{ id: string; sort_order: number; owner_id: string }>('SELECT id,sort_order,owner_id FROM habits WHERE id=?', id);
      if (!current) return;
      const neighbor = await tx.getFirstAsync<{ id: string; sort_order: number }>(`SELECT id,sort_order FROM habits WHERE owner_id=? AND id<>? AND sort_order ${direction < 0 ? '<' : '>'} ? ORDER BY sort_order ${direction < 0 ? 'DESC' : 'ASC'} LIMIT 1`, current.owner_id, id, current.sort_order);
      if (!neighbor) return;
      await tx.runAsync('UPDATE habits SET sort_order=? WHERE id=?', neighbor.sort_order, id);
      await tx.runAsync('UPDATE habits SET sort_order=? WHERE id=?', current.sort_order, neighbor.id);
    });
  },
  setHabitAmount: async (habitId: string, day: string, amount: number) => {
    if (!Number.isFinite(amount) || amount < 0 || amount > 100000000) throw Error('Enter a valid nonnegative amount.');
    const d = await db();
    await d.withExclusiveTransactionAsync(async tx => {
      const habit = await tx.getFirstAsync<Habit>('SELECT * FROM habits WHERE id=?', habitId);
      if (!habit || habit.habit_type !== 'quantity') throw Error('Measurable habit not found.');
      const prior = await tx.getFirstAsync<HabitProgress>('SELECT * FROM habit_progress WHERE habit_id=? AND day=?', habitId, day);
      const target = prior?.target_snapshot ?? habit.target_value ?? 1;
      if (amount === 0) await tx.runAsync('DELETE FROM habit_progress WHERE habit_id=? AND day=?', habitId, day);
      else await tx.runAsync('INSERT INTO habit_progress (id,habit_id,day,amount,target_snapshot,unit_snapshot,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(habit_id,day) DO UPDATE SET amount=excluded.amount,updated_at=excluded.updated_at', `${habitId}:${day}`, habitId, day, amount, target, prior?.unit_snapshot ?? habit.unit ?? '', new Date().toISOString());
      if (amount >= target) await tx.runAsync('INSERT OR IGNORE INTO habit_completions VALUES (?,?,?,?)', uid(), habitId, day, new Date().toISOString());
      else await tx.runAsync('DELETE FROM habit_completions WHERE habit_id=? AND day=?', habitId, day);
    });
  },
  toggleHabit: async (id: string, day: string) => { const d = await db(); await d.withExclusiveTransactionAsync(async tx => { const exists = await tx.getFirstAsync('SELECT id FROM habit_completions WHERE habit_id=? AND day=?', id, day); if (exists) await tx.runAsync('DELETE FROM habit_completions WHERE habit_id=? AND day=?', id, day); else await tx.runAsync('INSERT INTO habit_completions VALUES (?,?,?,?)', uid(), id, day, new Date().toISOString()); }); },
  setHabitCompletion: async (id: string, day: string, completed: boolean) => { const d = await db(); if (completed) await d.runAsync('INSERT OR IGNORE INTO habit_completions VALUES (?,?,?,?)', uid(), id, day, new Date().toISOString()); else await d.runAsync('DELETE FROM habit_completions WHERE habit_id=? AND day=?', id, day); },
  missions: () => all<Mission>('missions', 'ORDER BY created_at DESC'),
  manual: () => all<MissionCompletion>('mission_completions'),
  saveMission: (m: Mission) => put('missions', m),
  toggleMission: async (id: string, day: string) => { const d = await db(); await d.withExclusiveTransactionAsync(async tx => { const exists = await tx.getFirstAsync('SELECT id FROM mission_completions WHERE mission_id=? AND day=?', id, day); if (exists) await tx.runAsync('DELETE FROM mission_completions WHERE mission_id=? AND day=?', id, day); else await tx.runAsync('INSERT INTO mission_completions VALUES (?,?,?)', uid(), id, day); }); },
  setMissionCompletion: async (id: string, day: string, completed: boolean) => { const d = await db(); if (completed) await d.runAsync('INSERT OR IGNORE INTO mission_completions VALUES (?,?,?)', uid(), id, day); else await d.runAsync('DELETE FROM mission_completions WHERE mission_id=? AND day=?', id, day); },
  setWeeklyMissionCompletion: async (id: string, week: string, completed: boolean) => { const d = await db(); if (completed) await d.runAsync('INSERT OR IGNORE INTO mission_completions VALUES (?,?,?)', uid(), id, week); else await d.runAsync('DELETE FROM mission_completions WHERE mission_id=? AND day BETWEEN ? AND ?', id, week, addDays(week, 6)); },
  weights: () => all<WeightEntry>('weights', 'ORDER BY day DESC, created_at DESC'),
  saveWeight: (w: WeightEntry) => put('weights', w),
  measurements: () => all<Measurement>('measurements', 'ORDER BY day DESC'),
  saveMeasurement: (m: Measurement) => put('measurements', m),
  exercises: async () => { await ensureExerciseCatalog(); return all<Exercise>('exercises', 'ORDER BY custom, name'); },
  searchExercises: async (search = '', muscle = '', equipment = '', category = '', limit = 60) => {
    await ensureExerciseCatalog();
    const d = await db();
    const term = normalizeExerciseText(search);
    return d.getAllAsync<Exercise & { muscle_group: string | null; equipment: string | null; category: string | null }>(exerciseSearchQuery, term, term, muscle, muscle, equipment, equipment, category, category, limit);
  },
  exerciseFilters: async () => {
    await ensureExerciseCatalog();
    const d = await db();
    const rows = await d.getAllAsync<{ muscle_group_key: string; equipment_key: string; category: string }>('SELECT DISTINCT muscle_group_key,equipment_key,category FROM exercise_catalog');
    return { muscles: [...new Set(rows.map(row => row.muscle_group_key))].sort(), equipment: [...new Set(rows.map(row => row.equipment_key))].sort(), categories: [...new Set(rows.map(row => row.category))].sort() };
  },
  exerciseDetail: async (id: string) => { await ensureExerciseCatalog(); return (await db()).getFirstAsync<ExerciseDetail>('SELECT * FROM exercise_catalog WHERE exercise_id=?', id); },
  saveExercise: (e: Exercise) => put('exercises', e),
  workouts: () => all<Workout>('workouts', 'ORDER BY day DESC, created_at DESC'),
  trainingWorkouts: async () => (await db()).getAllAsync<Workout>(trainingWorkoutsQuery),
  workoutExercises: () => all<WorkoutExercise>('workout_exercises', 'ORDER BY position'),
  workoutSets: () => all<WorkoutSet>('workout_sets', 'ORDER BY set_number'),
  workoutSession: async (ownerId: string, workoutId: string) => workoutBundleFrom(await db(), ownerId, workoutId),
  openWorkoutSession: async (ownerId: string) => (await db()).getFirstAsync<OpenWorkout>(`SELECT w.*,
    (SELECT COUNT(*) FROM workout_exercises e JOIN workout_sets s ON s.workout_exercise_id=e.id WHERE e.workout_id=w.id) AS total_sets,
    (SELECT COUNT(*) FROM workout_exercises e JOIN workout_sets s ON s.workout_exercise_id=e.id WHERE e.workout_id=w.id AND s.completed=1) AS completed_sets
    FROM workouts w WHERE w.owner_id=? AND w.session_status IN ('running','paused') ORDER BY w.created_at LIMIT 1`, ownerId),
  beginWorkoutSession: async (ownerId: string, routineId: string | null, now = Date.now()): Promise<{ bundle: WorkoutBundle; existing: boolean }> => {
    const d = await db();
    let result: { bundle: WorkoutBundle; existing: boolean } | null = null;
    await d.withExclusiveTransactionAsync(async tx => {
      const current = await tx.getFirstAsync<Workout>('SELECT * FROM workouts WHERE owner_id=? AND session_status IN (\'running\',\'paused\') ORDER BY created_at LIMIT 1', ownerId);
      if (current) {
        const bundle = await workoutBundleFrom(tx, ownerId, current.id);
        if (!bundle) throw Error('The workout in progress could not be loaded.');
        result = { bundle, existing: true };
        return;
      }

      let name = '';
      let routineLinks: RoutineExercise[] = [];
      if (routineId) {
        const routine = await tx.getFirstAsync<{ name: string }>('SELECT name FROM routines WHERE id=? AND owner_id=?', routineId, ownerId);
        if (!routine) throw Error('Routine not found.');
        name = routine.name;
        routineLinks = await tx.getAllAsync<RoutineExercise>('SELECT * FROM routine_exercises WHERE routine_id=? ORDER BY position', routineId);
      }
      const stamp = Number.isFinite(now) && now >= 0 ? now : Date.now();
      const date = new Date(stamp);
      const timer = startWorkoutTimer(stamp);
      const workout: Workout = {
        id: uid(), owner_id: ownerId, name, day: dayKey(date), started_at: date.toISOString(), duration_min: null, notes: '', completed: 0, created_at: date.toISOString(),
        ...timer,
      };
      await tx.runAsync(`INSERT INTO workouts (id,owner_id,name,day,started_at,duration_min,notes,completed,created_at,session_status,elapsed_seconds,running_since_ms,paused_since_ms,paused_seconds,finished_at_ms)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, workout.id, workout.owner_id, workout.name, workout.day, workout.started_at, null, workout.notes, 0, workout.created_at, 'running', 0, stamp, null, 0, null);
      // Planned routine sets (reps/weight targets) are prefilled but not completed.
      const exercises: WorkoutBundle['exercises'] = routineId ? await insertRoutineSessionExercises(tx, workout.id, routineId, routineLinks) : [];
      result = { bundle: { workout, exercises }, existing: false };
    });
    if (!result) throw Error('Could not start the workout.');
    return result;
  },
  persistWorkoutSession: async (workout: Workout, exercises: WorkoutBundle['exercises']) => {
    const d = await db();
    await d.withExclusiveTransactionAsync(async tx => {
      const current = await tx.getFirstAsync<{ owner_id: string }>('SELECT owner_id FROM workouts WHERE id=?', workout.id);
      if (!current || current.owner_id !== workout.owner_id) throw Error('Workout session is no longer available for this account.');
      const state = workout.session_status ?? (workout.completed ? 'completed' : 'draft');
      const elapsed = Math.max(0, Math.floor(workout.elapsed_seconds ?? 0));
      await tx.runAsync(`UPDATE workouts SET name=?,day=?,started_at=?,duration_min=?,notes=?,completed=?,session_status=?,elapsed_seconds=?,running_since_ms=?,paused_since_ms=?,paused_seconds=?,finished_at_ms=? WHERE id=? AND owner_id=?`,
        workout.name, workout.day, workout.started_at, workout.duration_min, workout.notes, workout.completed, state, elapsed,
        workout.running_since_ms ?? null, workout.paused_since_ms ?? null, Math.max(0, Math.floor(workout.paused_seconds ?? 0)), workout.finished_at_ms ?? null, workout.id, workout.owner_id);
      const retainedLinks = new Set(exercises.map(item => item.link.id));
      const oldLinks = await tx.getAllAsync<{ id: string }>('SELECT id FROM workout_exercises WHERE workout_id=?', workout.id);
      for (const link of oldLinks) if (!retainedLinks.has(link.id)) await tx.runAsync('DELETE FROM workout_exercises WHERE id=?', link.id);
      for (const item of exercises) {
        if (item.link.workout_id !== workout.id) throw Error('Invalid workout exercise reference.');
        await tx.runAsync(`INSERT INTO workout_exercises (id,workout_id,exercise_id,position) VALUES (?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET workout_id=excluded.workout_id,exercise_id=excluded.exercise_id,position=excluded.position`, item.link.id, item.link.workout_id, item.link.exercise_id, item.link.position);
        const retainedSets = new Set(item.sets.map(set => set.id));
        const oldSets = await tx.getAllAsync<{ id: string }>('SELECT id FROM workout_sets WHERE workout_exercise_id=?', item.link.id);
        for (const set of oldSets) if (!retainedSets.has(set.id)) await tx.runAsync('DELETE FROM workout_sets WHERE id=?', set.id);
        for (const set of item.sets) {
          if (set.workout_exercise_id !== item.link.id) throw Error('Invalid workout set reference.');
          await tx.runAsync(`INSERT INTO workout_sets (id,workout_exercise_id,set_number,reps,weight_kg,duration_sec,note,completed) VALUES (?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET workout_exercise_id=excluded.workout_exercise_id,set_number=excluded.set_number,reps=excluded.reps,weight_kg=excluded.weight_kg,duration_sec=excluded.duration_sec,note=excluded.note,completed=excluded.completed`,
            set.id, set.workout_exercise_id, set.set_number, set.reps, set.weight_kg, set.duration_sec, set.note, set.completed);
        }
      }
    });
  },
  discardWorkoutSession: async (ownerId: string, workoutId: string) => {
    const d = await db();
    await d.withExclusiveTransactionAsync(async tx => {
      const row = await tx.getFirstAsync<{ session_status: string; completed: number }>('SELECT session_status,completed FROM workouts WHERE id=? AND owner_id=?', workoutId, ownerId);
      if (!row || row.completed || (row.session_status !== 'running' && row.session_status !== 'paused')) throw Error('Only this account’s unfinished workout can be discarded.');
      // Child rows are removed explicitly: transaction connections do not enforce cascades.
      await tx.runAsync('DELETE FROM workout_sets WHERE workout_exercise_id IN (SELECT id FROM workout_exercises WHERE workout_id=?)', workoutId);
      await tx.runAsync('DELETE FROM workout_exercises WHERE workout_id=?', workoutId);
      await tx.runAsync('DELETE FROM workouts WHERE id=? AND owner_id=?', workoutId, ownerId);
    });
  },
  saveWorkout: (w: Workout) => put('workouts', w),
  saveWorkoutBundle: async (w: Workout, exercises: { link: WorkoutExercise; sets: WorkoutSet[] }[]) => { const d = await db(); await d.withExclusiveTransactionAsync(async tx => {
    const state = w.session_status ?? (w.completed ? 'completed' : 'draft');
    await tx.runAsync(`INSERT INTO workouts (id,owner_id,name,day,started_at,duration_min,notes,completed,created_at,session_status,elapsed_seconds,running_since_ms,paused_since_ms,paused_seconds,finished_at_ms)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,day=excluded.day,started_at=excluded.started_at,duration_min=excluded.duration_min,notes=excluded.notes,completed=excluded.completed,session_status=excluded.session_status,elapsed_seconds=excluded.elapsed_seconds,running_since_ms=excluded.running_since_ms,paused_since_ms=excluded.paused_since_ms,paused_seconds=excluded.paused_seconds,finished_at_ms=excluded.finished_at_ms`,
      w.id,w.owner_id,w.name,w.day,w.started_at,w.duration_min,w.notes,w.completed,w.created_at,state,Math.max(0,Math.floor(w.elapsed_seconds ?? Math.max(0, w.duration_min ?? 0) * 60)),w.running_since_ms ?? null,w.paused_since_ms ?? null,Math.max(0,Math.floor(w.paused_seconds ?? 0)),w.finished_at_ms ?? null);
    await tx.runAsync('DELETE FROM workout_exercises WHERE workout_id=?',w.id);
    for (const item of exercises) { await tx.runAsync('INSERT INTO workout_exercises VALUES (?,?,?,?)',item.link.id,item.link.workout_id,item.link.exercise_id,item.link.position); for (const s of item.sets) await tx.runAsync('INSERT INTO workout_sets (id,workout_exercise_id,set_number,reps,weight_kg,duration_sec,note,completed) VALUES (?,?,?,?,?,?,?,?)',s.id,s.workout_exercise_id,s.set_number,s.reps,s.weight_kg,s.duration_sec,s.note,s.completed); }
  }); },
  saveWorkoutExercise: (e: WorkoutExercise) => put('workout_exercises', e),
  saveSet: (s: WorkoutSet) => put('workout_sets', s),
  routines: () => all<Routine>('routines', 'ORDER BY created_at DESC'),
  routineExercises: () => all<RoutineExercise>('routine_exercises', 'ORDER BY position'),
  saveRoutine: (r: Routine) => put('routines', r),
  saveRoutineExercise: (r: RoutineExercise) => put('routine_exercises', r),
  routineDraft: async (ownerId: string, routineId: string) => loadRoutineDraft(await db(), ownerId, routineId),
  saveRoutineDraft: async (ownerId: string, draft: RoutineDraft, names?: ReadonlyMap<string, string>) => { await ensureExerciseCatalog(); return saveRoutineDraft(await db(), ownerId, draft, names); },
  deleteRoutine: async (ownerId: string, routineId: string) => deleteRoutine(await db(), ownerId, routineId),
  /** Muscle group and target muscle for catalog exercises (custom exercises have none). */
  exerciseMuscles: async () => { await ensureExerciseCatalog(); return (await db()).getAllAsync<{ exercise_id: string; muscle_group: string; target_muscle: string }>('SELECT exercise_id,muscle_group,target_muscle FROM exercise_catalog'); },
  restDays: async () => (await db()).getAllAsync<{ day: string }>('SELECT day FROM rest_days'),
  toggleRest: async (owner: string, day: string) => { const d = await db(); await d.withExclusiveTransactionAsync(async tx=>{const x=await tx.getFirstAsync('SELECT day FROM rest_days WHERE owner_id=? AND day=?',owner,day);if(x)await tx.runAsync('DELETE FROM rest_days WHERE owner_id=? AND day=?',owner,day);else await tx.runAsync('INSERT INTO rest_days VALUES (?,?)',owner,day);}); },
  favorites: () => all<Favorite>('favorites'),
  toggleFavorite: async (owner: string, card: string) => { const d = await db(); await d.withExclusiveTransactionAsync(async tx=>{const x=await tx.getFirstAsync('SELECT card_id FROM favorites WHERE owner_id=? AND card_id=?',owner,card);if(x)await tx.runAsync('DELETE FROM favorites WHERE owner_id=? AND card_id=?',owner,card);else await tx.runAsync('INSERT INTO favorites VALUES (?,?)',card,owner);}); },
  preferences: () => all<Preference>('preferences'),
  setPreference: async (key: string, value: string) => (await db()).runAsync('INSERT OR REPLACE INTO preferences VALUES (?,?)', key, value),
  clear: async () => { const d = await db(); await d.withExclusiveTransactionAsync(async tx => { for (const t of ['profile', 'preferences', 'notification_schedules']) await tx.runAsync(`DELETE FROM ${t}`); await tx.runAsync('DELETE FROM exercises WHERE custom=1'); }); },
};
