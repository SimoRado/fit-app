import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { describe, expect, it } from 'vitest';
import { exerciseSeeds, migrations } from '../src/data/schema';
import {
  activeExerciseIndex, addExercise, addTargetSet, decodeRoutineTargets, emptyRoutineDraft, encodeRoutineTargets, formatPreviousSet, moveExercise,
  parseTargetNumber, plannedSetCount, previousColumnWidth, previousPerformance, removeAt, removeExercise, removeTargetSet, replaceExercise,
  restRemaining, routineSetsPreferenceKey, sameRoutineDraft, setRowColumns, updateTargetSet, validateRoutineDraft, workoutTotals, type RoutineDraft,
} from '../src/core/routineDraft';
import { gymSchedulePreferenceKey, parseGymSchedule, resolveDayPlan, serializeGymSchedule, setGymDayPlan } from '../src/core/gymSchedule';
import { deleteRoutine, insertRoutineSessionExercises, loadRoutineDraft, saveRoutineDraft } from '../src/data/routineStore';
import type { Workout, WorkoutExercise, WorkoutSet } from '../src/core/types';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

/** In-memory SQLite with the real migrations and an expo-sqlite shaped adapter. */
function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON');
  migrations.forEach(migration => sql.exec(migration));
  for (const [id, name] of exerciseSeeds) sql.prepare('INSERT INTO exercises VALUES (?,?,?,0)').run(id, name, id === 'pullup' ? 'reps' : 'weight_reps');
  for (const owner of ['owner', 'other']) sql.prepare('INSERT INTO profile VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(owner, 'Alex', '1990-01-01', 175, 80, null, 'Beginner', 'Fitness', '', 'en', 'now');
  const api = {
    runAsync: async (query: string, ...args: unknown[]) => sql.prepare(query).run(...args as []),
    getFirstAsync: async <T>(query: string, ...args: unknown[]) => (sql.prepare(query).get(...args as []) ?? null) as T | null,
    getAllAsync: async <T>(query: string, ...args: unknown[]) => sql.prepare(query).all(...args as []) as T[],
  };
  const adapter = {
    ...api,
    withExclusiveTransactionAsync: async (callback: (tx: typeof api) => Promise<void>) => {
      sql.exec('BEGIN');
      try { await callback(api); sql.exec('COMMIT'); } catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  } as unknown as SQLiteDatabase;
  return { sql, adapter, api: api as unknown as SQLiteDatabase };
}
const rows = <T>(sql: DatabaseSync, query: string, ...args: unknown[]) => sql.prepare(query).all(...args as []) as T[];

function pushDay(): RoutineDraft {
  let draft = { ...emptyRoutineDraft(), name: 'Push Day' };
  draft = addExercise(draft, 'bench');
  draft = addExercise(draft, 'shoulder', { sets: 2 });
  draft = updateTargetSet(draft, draft.exercises[0].key, 0, { reps: 10, weightKg: 60 });
  return draft;
}

describe('routine draft operations', () => {
  it('creates a routine and adds multiple exercises with planned sets', () => {
    const draft = pushDay();
    expect(draft.exercises.map(item => item.exerciseId)).toEqual(['bench', 'shoulder']);
    expect(draft.exercises[0].sets).toHaveLength(3);
    expect(draft.exercises[1].sets).toHaveLength(2);
    expect(plannedSetCount(draft)).toBe(5);
  });

  it('ignores accidental duplicate adds but allows an explicit second copy', () => {
    const draft = pushDay();
    expect(addExercise(draft, 'bench').exercises).toHaveLength(2);
    expect(addExercise(draft, 'bench', { allowDuplicate: true }).exercises.map(item => item.exerciseId)).toEqual(['bench', 'shoulder', 'bench']);
    expect(replaceExercise(draft, draft.exercises[1].key, 'bench')).toBe(draft);
    expect(replaceExercise(draft, draft.exercises[1].key, 'curl').exercises[1].exerciseId).toBe('curl');
  });

  it('removes and reorders exercises without touching the others', () => {
    const draft = addExercise(pushDay(), 'curl');
    const moved = moveExercise(draft, draft.exercises[2].key, -1);
    expect(moved.exercises.map(item => item.exerciseId)).toEqual(['bench', 'curl', 'shoulder']);
    expect(moveExercise(draft, draft.exercises[0].key, -1)).toBe(draft);
    const removed = removeExercise(moved, moved.exercises[1].key);
    expect(removed.exercises.map(item => item.exerciseId)).toEqual(['bench', 'shoulder']);
    expect(removed.exercises[0].sets[0]).toMatchObject({ reps: 10, weightKg: 60 });
  });

  it('adds a set copying the last targets and removes sets with correct renumbering', () => {
    let draft = pushDay();
    const key = draft.exercises[0].key;
    draft = updateTargetSet(draft, key, 2, { reps: 6, weightKg: 70 });
    draft = addTargetSet(draft, key);
    expect(draft.exercises[0].sets).toHaveLength(4);
    expect(draft.exercises[0].sets[3]).toMatchObject({ reps: 6, weightKg: 70 });
    expect(draft.exercises[0].sets[3].key).not.toBe(draft.exercises[0].sets[2].key);
    draft = removeTargetSet(draft, key, 0);
    // Remaining sets keep their values; display numbers come from position (1, 2, 3).
    expect(draft.exercises[0].sets.map(set => set.reps)).toEqual([null, 6, 6]);
    expect(draft.exercises[1].sets).toHaveLength(2);
    expect(removeTargetSet(draft, key, 9).exercises[0].sets).toHaveLength(3);
  });

  it('parses and validates weight and repetition input', () => {
    expect(parseTargetNumber('62,5', 'weight')).toBe(62.5);
    expect(parseTargetNumber('2.', 'weight')).toBe(2);
    expect(parseTargetNumber('', 'reps')).toBeNull();
    expect(parseTargetNumber('8.5', 'reps')).toBeUndefined();
    expect(parseTargetNumber('1001', 'weight')).toBeUndefined();
    expect(() => validateRoutineDraft({ ...pushDay(), name: '  ' })).toThrow('Enter a routine name.');
    expect(() => validateRoutineDraft(pushDay())).not.toThrow();
    const draft = pushDay();
    const emptied = removeTargetSet(removeTargetSet(draft, draft.exercises[1].key, 0), draft.exercises[1].key, 0);
    expect(() => validateRoutineDraft(emptied, new Map([['shoulder', 'Shoulder Press']]))).toThrow('Add at least one set to Shoulder Press');
  });

  it('detects unsaved changes for cancel/discard and ignores UI-only keys', () => {
    const draft = pushDay();
    const reloaded = { ...draft, exercises: draft.exercises.map(item => ({ ...item, key: 'other', sets: item.sets.map(set => ({ ...set, key: 'k' })) })) };
    expect(sameRoutineDraft(draft, reloaded)).toBe(true);
    expect(sameRoutineDraft(draft, { ...draft, name: 'Pull Day' })).toBe(false);
    expect(sameRoutineDraft(draft, addTargetSet(draft, draft.exercises[0].key))).toBe(false);
  });

  it('encodes planned sets compactly and decodes them position-aligned', () => {
    const draft = pushDay();
    const encoded = encodeRoutineTargets(draft.exercises);
    expect(encoded).not.toContain('key');
    const decoded = decodeRoutineTargets(encoded, ['bench', 'shoulder']);
    expect(decoded[0][0]).toMatchObject({ reps: 10, weightKg: 60, durationSec: null });
    expect(decodeRoutineTargets(encoded, ['squat', 'shoulder'])[0]).toEqual([]);
    expect(decodeRoutineTargets('not json', ['bench'])).toEqual([[]]);
    let big = { ...emptyRoutineDraft(), name: 'Huge' } as RoutineDraft;
    for (let i = 0; i < 40; i++) big = addExercise(big, `catalog:${String(i).padStart(4, '0')}`, { sets: 10 });
    expect(() => validateRoutineDraft(big)).toThrow(/too many planned sets/);
  });
});

describe('routine persistence (SQLite)', () => {
  it('saves a new routine with ordered exercises and planned sets, then edits it', async () => {
    const { sql, adapter } = database();
    const id = await saveRoutineDraft(adapter, 'owner', pushDay());
    expect(rows<{ exercise_id: string; position: number }>(sql, 'SELECT exercise_id,position FROM routine_exercises WHERE routine_id=? ORDER BY position', id)).toEqual([{ exercise_id: 'bench', position: 0 }, { exercise_id: 'shoulder', position: 1 }]);
    const loaded = await loadRoutineDraft(adapter, 'owner', id);
    expect(loaded?.name).toBe('Push Day');
    expect(loaded?.exercises[0].sets[0]).toMatchObject({ reps: 10, weightKg: 60 });
    const edited = moveExercise({ ...loaded!, name: 'Push A' }, loaded!.exercises[1].key, -1);
    await saveRoutineDraft(adapter, 'owner', edited);
    expect(rows<{ name: string }>(sql, 'SELECT name FROM routines')).toEqual([{ name: 'Push A' }]);
    expect(rows<{ exercise_id: string }>(sql, 'SELECT exercise_id FROM routine_exercises WHERE routine_id=? ORDER BY position', id).map(row => row.exercise_id)).toEqual(['shoulder', 'bench']);
    expect((await loadRoutineDraft(adapter, 'owner', id))?.exercises[1].sets[0]).toMatchObject({ reps: 10, weightKg: 60 });
    expect(sql.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('rejects invalid drafts without writing anything', async () => {
    const { sql, adapter } = database();
    await expect(saveRoutineDraft(adapter, 'owner', { ...pushDay(), name: '' })).rejects.toThrow('Enter a routine name.');
    expect(rows(sql, 'SELECT * FROM routines')).toHaveLength(0);
  });

  it('deletes a routine, its plan and schedule references, but keeps workout history', async () => {
    const { sql, adapter } = database();
    const id = await saveRoutineDraft(adapter, 'owner', pushDay());
    const keep = await saveRoutineDraft(adapter, 'owner', { ...pushDay(), name: 'Legs' });
    const plan = setGymDayPlan(setGymDayPlan([], 1, { weekday: 1, kind: 'routine', routineId: id }), 3, { weekday: 3, kind: 'routine', routineId: keep });
    sql.prepare('INSERT INTO preferences VALUES (?,?)').run(gymSchedulePreferenceKey, serializeGymSchedule(plan));
    sql.prepare('INSERT INTO workouts (id,owner_id,name,day,started_at,notes,completed,created_at) VALUES (?,?,?,?,?,?,?,?)').run('w1', 'owner', 'Push Day', '2026-11-10', '2026-11-10T10:00:00Z', '', 1, 'now');
    sql.prepare('INSERT INTO workout_exercises VALUES (?,?,?,?)').run('we1', 'w1', 'bench', 0);
    sql.prepare('INSERT INTO workout_sets (id,workout_exercise_id,set_number,reps,weight_kg,duration_sec,note,completed) VALUES (?,?,?,?,?,?,?,?)').run('s1', 'we1', 1, 10, 60, null, '', 1);
    await deleteRoutine(adapter, 'owner', id);
    expect(rows<{ id: string }>(sql, 'SELECT id FROM routines').map(row => row.id)).toEqual([keep]);
    expect(rows(sql, 'SELECT * FROM routine_exercises WHERE routine_id=?', id)).toHaveLength(0);
    expect(rows(sql, 'SELECT * FROM preferences WHERE key=?', routineSetsPreferenceKey(id))).toHaveLength(0);
    const remaining = parseGymSchedule((sql.prepare('SELECT value FROM preferences WHERE key=?').get(gymSchedulePreferenceKey) as { value: string }).value);
    expect(remaining).toEqual([{ weekday: 3, kind: 'routine', routineId: keep }]);
    expect(rows(sql, 'SELECT * FROM workouts')).toHaveLength(1);
    expect(rows(sql, 'SELECT * FROM workout_sets WHERE completed=1')).toHaveLength(1);
  });

  it('keeps routines isolated per account', async () => {
    const { adapter } = database();
    const id = await saveRoutineDraft(adapter, 'owner', pushDay());
    expect(await loadRoutineDraft(adapter, 'other', id)).toBeNull();
    await expect(deleteRoutine(adapter, 'other', id)).rejects.toThrow('Routine not found for this account.');
    await expect(saveRoutineDraft(adapter, 'other', { ...pushDay(), id })).rejects.toThrow('Routine not found for this account.');
    expect((await loadRoutineDraft(adapter, 'owner', id))?.name).toBe('Push Day');
  });

  it('starts a scheduled routine with its planned sets prefilled and not completed', async () => {
    const { sql, adapter, api } = database();
    const id = await saveRoutineDraft(adapter, 'owner', pushDay());
    sql.prepare('INSERT INTO workouts (id,owner_id,name,day,started_at,notes,completed,created_at) VALUES (?,?,?,?,?,?,?,?)').run('live', 'owner', 'Push Day', '2026-11-14', '2026-11-14T10:00:00Z', '', 0, 'now');
    const links = rows<{ id: string; routine_id: string; exercise_id: string; position: number }>(sql, 'SELECT * FROM routine_exercises WHERE routine_id=? ORDER BY position', id);
    const exercises = await insertRoutineSessionExercises(api, 'live', id, links);
    expect(exercises.map(item => item.sets.length)).toEqual([3, 2]);
    expect(exercises[0].sets[0]).toMatchObject({ set_number: 1, reps: 10, weight_kg: 60, completed: 0 });
    expect(rows(sql, 'SELECT * FROM workout_sets WHERE completed=0')).toHaveLength(5);
  });
});

describe('gym-day planning', () => {
  const routines = new Set(['push', 'legs']);
  it('assigns, changes and removes a weekly routine', () => {
    let plan = setGymDayPlan([], 1, { weekday: 1, kind: 'routine', routineId: 'push' });
    expect(resolveDayPlan(plan, '2026-11-16', [], routines)).toEqual({ kind: 'routine', routineId: 'push' }); // Monday
    plan = setGymDayPlan(plan, 1, { weekday: 1, kind: 'routine', routineId: 'legs' });
    expect(plan).toHaveLength(1);
    expect(resolveDayPlan(plan, '2026-11-23', [], routines)).toEqual({ kind: 'routine', routineId: 'legs' });
    plan = setGymDayPlan(plan, 1, null);
    expect(resolveDayPlan(plan, '2026-11-16', [], routines)).toBeNull();
  });
  it('prefers a one-off rest day and ignores deleted routines', () => {
    const plan = setGymDayPlan([], 1, { weekday: 1, kind: 'routine', routineId: 'gone' });
    expect(resolveDayPlan(plan, '2026-11-16', [], routines)).toBeNull();
    expect(resolveDayPlan(plan, '2026-11-16', ['2026-11-16'], routines)).toEqual({ kind: 'rest', oneOff: true });
    expect(resolveDayPlan(setGymDayPlan([], 1, { weekday: 1, kind: 'rest' }), '2026-11-16', [], routines)).toEqual({ kind: 'rest', oneOff: false });
  });
});

describe('active workout statistics', () => {
  const items = [
    { exerciseId: 'bench', sets: [{ reps: '10', weight: '60', completed: true }, { reps: '8', weight: '65', completed: false }] },
    { exerciseId: 'pullup', sets: [{ reps: '8', weight: '', completed: true }] },
  ];
  it('derives sets, volume and exercise count from one workout state', () => {
    expect(workoutTotals(items)).toEqual({ totalSets: 3, doneSets: 2, volume: 600, exercises: 2 });
    const added = [...items, { exerciseId: 'curl', sets: [{ reps: '12', weight: '12.5', completed: true }] }];
    expect(workoutTotals(added)).toEqual({ totalSets: 4, doneSets: 3, volume: 750, exercises: 3 });
    const removedSet = [{ ...items[0], sets: removeAt(items[0].sets, 0) }, items[1]];
    expect(workoutTotals(removedSet)).toEqual({ totalSets: 2, doneSets: 1, volume: 0, exercises: 2 });
    const marked = [{ ...items[0], sets: items[0].sets.map(set => ({ ...set, completed: true })) }, items[1]];
    expect(workoutTotals(marked).volume).toBe(1120);
    expect(activeExerciseIndex(items)).toBe(0);
    expect(activeExerciseIndex(marked)).toBe(-1);
  });

  it('shows previous performance from the latest other completed session', () => {
    const workout = (id: string, day: string, completed = 1) => ({ id, owner_id: 'o', name: 'Push', day, started_at: `${day}T10:00:00Z`, duration_min: 50, notes: '', completed, created_at: day }) as Workout;
    const workouts = [workout('old', '2026-11-01'), workout('recent', '2026-11-08'), workout('live', '2026-11-14', 0)];
    const links: WorkoutExercise[] = [{ id: 'a', workout_id: 'old', exercise_id: 'bench', position: 0 }, { id: 'b', workout_id: 'recent', exercise_id: 'bench', position: 0 }, { id: 'c', workout_id: 'live', exercise_id: 'bench', position: 0 }];
    const set = (id: string, link: string, n: number, reps: number, kg: number, completed = 1) => ({ id, workout_exercise_id: link, set_number: n, reps, weight_kg: kg, duration_sec: null, note: '', completed }) as WorkoutSet;
    const sets = [set('1', 'a', 1, 10, 40), set('2', 'b', 2, 8, 65), set('3', 'b', 1, 10, 60), set('4', 'b', 3, 5, 70, 0), set('5', 'c', 1, 12, 99)];
    const previous = previousPerformance(workouts, links, sets, 'live').get('bench')!;
    expect(previous.map(row => formatPreviousSet(row))).toEqual(['60 × 10', '65 × 8']);
    expect(formatPreviousSet(undefined)).toBe('—');
    expect(formatPreviousSet({ reps: 12, weight_kg: null, duration_sec: null }, 'reps')).toBe('12 reps');
    expect(formatPreviousSet({ reps: null, weight_kg: null, duration_sec: 45 }, 'duration')).toBe('45 s');
  });

  it('computes rest time from an absolute end time', () => {
    expect(restRemaining(10_000, 0)).toBe(10);
    expect(restRemaining(10_000, 9_100)).toBe(1);
    expect(restRemaining(10_000, 12_000)).toBe(0);
    expect(restRemaining(null, 0)).toBe(0);
  });
});

describe('compact set row layout', () => {
  it('fits set, previous, kg, reps and check on one row down to 320dp', () => {
    // Active workout blocks are flat: only the 18dp page gutters are subtracted.
    for (const width of [320, 340, 360, 393, 412]) expect(previousColumnWidth(width, 36)).toBeGreaterThanOrEqual(40);
    // Routine builder rows sit inside a card (16dp padding + 1dp border each side) and have no check/previous.
    for (const width of [320, 360, 412]) expect(previousColumnWidth(width, 36 + 34, 'weight_reps', false)).toBeGreaterThanOrEqual(0);
    expect(setRowColumns(320).cell).toBeGreaterThanOrEqual(56);
    expect(setRowColumns(320).check).toBeGreaterThanOrEqual(36);
  });
});

describe('screens use the shared engine, both themes and reduced motion', () => {
  it('routine builder saves through the repository and guards unsaved changes', () => {
    const form = source('src/app/routine-form.tsx');
    expect(form).toContain('repo.saveRoutineDraft(profile.id, draft, names)');
    expect(form).toContain('repo.deleteRoutine(profile.id, draft.id!)');
    expect(form).toContain('usePreventRemove(dirty && !leaving && !discarded');
    expect(form).toContain('if (savingRef.current) return;');
    expect(form).not.toMatch(/<Image|uri:/);
  });
  it('active workout keeps live persistence, restore and finish flows', () => {
    const workout = source('src/app/workout-form.tsx');
    expect(workout).toContain('repo.workoutSession(ownerId, session ?? id!)');
    expect(workout).toContain('repo.persistWorkoutSession(workout, bundle)');
    expect(workout).toContain('finishLiveWorkout(close)');
    expect(workout).toContain('workoutTotals(draft.items)');
    expect(workout).toContain('<SetRow');
  });
  it('builder, picker and set rows use theme tokens and respect reduced motion', () => {
    for (const path of ['src/ui/SetRow.tsx', 'src/app/routine-form.tsx', 'src/ui/ExerciseBrowser.tsx']) {
      const text = source(path);
      expect(text).toContain('usePalette()');
      expect(text).not.toMatch(/#(?:FBF7EF|6B4DF5|8B5CF6|F97316|FFEDD5|FAF5FF)\b/i);
    }
    for (const path of ['src/ui/SetRow.tsx', 'src/app/routine-form.tsx', 'src/app/workout-form.tsx']) expect(source(path)).toMatch(/reduced \? undefined :/);
  });
});
