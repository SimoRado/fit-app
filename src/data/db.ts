import * as SQLite from 'expo-sqlite';
import { Exercise, Favorite, Habit, HabitCompletion, Measurement, Mission, MissionCompletion, Preference, Profile, Routine, RoutineExercise, WeightEntry, Workout, WorkoutExercise, WorkoutSet } from '../core/types';
import { addDays, dayKey, uid } from '../core/date';
import { exerciseSeeds, migrations } from './schema';
import { trainingWorkoutsQuery } from './queries';
import { localDatabaseName } from './account';

let promise: Promise<SQLite.SQLiteDatabase> | undefined;
let activeAccount: string | null = null;

export function setLocalAccount(userId: string | null) {
  if (userId !== null) localDatabaseName(userId);
  if (activeAccount !== userId) { activeAccount = userId; promise = undefined; }
}
export function getLocalAccount() { return activeAccount; }

export async function db() {
  if (!activeAccount) throw new Error('Sign in before accessing local fitness data');
  const requestedAccount = activeAccount;
  if (!promise) promise = (async () => {
    const d = await SQLite.openDatabaseAsync(localDatabaseName(requestedAccount));
    await d.execAsync('PRAGMA foreign_keys = ON');
    const row = await d.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    for (let i = row?.user_version ?? 0; i < migrations.length; i++) {
      await d.withExclusiveTransactionAsync(async tx => { await tx.execAsync(migrations[i]); await tx.execAsync(`PRAGMA user_version = ${i + 1}`); });
    }
    await d.withExclusiveTransactionAsync(async tx => {
      for (const [id, name] of exerciseSeeds) await tx.runAsync('INSERT OR IGNORE INTO exercises VALUES (?,?,?,0)', id, name, id === 'plank' || id === 'running' ? 'duration' : id === 'pullup' ? 'reps' : 'weight_reps');
    });
    if (activeAccount !== requestedAccount) throw new Error('Account changed while opening local data');
    return d;
  })();
  return promise;
}
export async function all<T>(table: string, order = ''): Promise<T[]> { return (await db()).getAllAsync<T>(`SELECT * FROM ${table} ${order}`); }
export async function one<T>(table: string, id: string): Promise<T | null> { return (await db()).getFirstAsync<T>(`SELECT * FROM ${table} WHERE id = ?`, id); }
export async function put(table: string, record: Record<string, unknown>) { const cols = Object.keys(record); await (await db()).runAsync(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${cols.filter(c=>c!=='id').map(c=>`${c}=excluded.${c}`).join(',')}`, ...(Object.values(record) as (string | number | null)[])); }
export async function remove(table: string, id: string) { await (await db()).runAsync(`DELETE FROM ${table} WHERE id=?`, id); }
export const repo = {
  one,
  remove,
  profile: async () => (await db()).getFirstAsync<Profile>('SELECT * FROM profile LIMIT 1'),
  saveProfile: async (p: Profile) => put('profile', p),
  createProfile: async (p: Profile) => { const d=await db(); await d.withExclusiveTransactionAsync(async tx=>{await tx.runAsync('INSERT INTO profile VALUES (?,?,?,?,?,?,?,?,?,?,?)',p.id,p.name,p.birth_date,p.height_cm,p.start_weight,p.target_weight,p.experience,p.fitness_goal,p.growth_goals,p.language,p.completed_at);await tx.runAsync('INSERT INTO weights VALUES (?,?,?,?,?,?)',uid(),p.id,dayKey(),p.start_weight,'Starting weight from onboarding',p.completed_at);}); },
  habits: () => all<Habit>('habits', 'ORDER BY created_at DESC'),
  completions: () => all<HabitCompletion>('habit_completions'),
  saveHabit: (h: Habit) => put('habits', h),
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
  exercises: () => all<Exercise>('exercises', 'ORDER BY custom, name'),
  saveExercise: (e: Exercise) => put('exercises', e),
  workouts: () => all<Workout>('workouts', 'ORDER BY day DESC, created_at DESC'),
  trainingWorkouts: async () => (await db()).getAllAsync<Workout>(trainingWorkoutsQuery),
  workoutExercises: () => all<WorkoutExercise>('workout_exercises', 'ORDER BY position'),
  workoutSets: () => all<WorkoutSet>('workout_sets', 'ORDER BY set_number'),
  saveWorkout: (w: Workout) => put('workouts', w),
  saveWorkoutBundle: async (w: Workout, exercises: { link: WorkoutExercise; sets: WorkoutSet[] }[]) => { const d = await db(); await d.withExclusiveTransactionAsync(async tx => {
    await tx.runAsync('INSERT INTO workouts VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,day=excluded.day,started_at=excluded.started_at,duration_min=excluded.duration_min,notes=excluded.notes,completed=excluded.completed', w.id,w.owner_id,w.name,w.day,w.started_at,w.duration_min,w.notes,w.completed,w.created_at);
    await tx.runAsync('DELETE FROM workout_exercises WHERE workout_id=?',w.id);
    for (const item of exercises) { await tx.runAsync('INSERT INTO workout_exercises VALUES (?,?,?,?)',item.link.id,item.link.workout_id,item.link.exercise_id,item.link.position); for (const s of item.sets) await tx.runAsync('INSERT INTO workout_sets (id,workout_exercise_id,set_number,reps,weight_kg,duration_sec,note,completed) VALUES (?,?,?,?,?,?,?,?)',s.id,s.workout_exercise_id,s.set_number,s.reps,s.weight_kg,s.duration_sec,s.note,s.completed); }
  }); },
  saveWorkoutExercise: (e: WorkoutExercise) => put('workout_exercises', e),
  saveSet: (s: WorkoutSet) => put('workout_sets', s),
  routines: () => all<Routine>('routines', 'ORDER BY created_at DESC'),
  routineExercises: () => all<RoutineExercise>('routine_exercises', 'ORDER BY position'),
  saveRoutine: (r: Routine) => put('routines', r),
  saveRoutineExercise: (r: RoutineExercise) => put('routine_exercises', r),
  restDays: async () => (await db()).getAllAsync<{ day: string }>('SELECT day FROM rest_days'),
  toggleRest: async (owner: string, day: string) => { const d = await db(); await d.withExclusiveTransactionAsync(async tx=>{const x=await tx.getFirstAsync('SELECT day FROM rest_days WHERE owner_id=? AND day=?',owner,day);if(x)await tx.runAsync('DELETE FROM rest_days WHERE owner_id=? AND day=?',owner,day);else await tx.runAsync('INSERT INTO rest_days VALUES (?,?)',owner,day);}); },
  favorites: () => all<Favorite>('favorites'),
  toggleFavorite: async (owner: string, card: string) => { const d = await db(); await d.withExclusiveTransactionAsync(async tx=>{const x=await tx.getFirstAsync('SELECT card_id FROM favorites WHERE owner_id=? AND card_id=?',owner,card);if(x)await tx.runAsync('DELETE FROM favorites WHERE owner_id=? AND card_id=?',owner,card);else await tx.runAsync('INSERT INTO favorites VALUES (?,?)',card,owner);}); },
  preferences: () => all<Preference>('preferences'),
  setPreference: async (key: string, value: string) => (await db()).runAsync('INSERT OR REPLACE INTO preferences VALUES (?,?)', key, value),
  clear: async () => { const d = await db(); await d.withExclusiveTransactionAsync(async tx => { for (const t of ['profile', 'preferences', 'notification_schedules']) await tx.runAsync(`DELETE FROM ${t}`); await tx.runAsync('DELETE FROM exercises WHERE custom=1'); }); },
};
