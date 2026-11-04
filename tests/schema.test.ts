import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { exerciseSeeds, migrations } from '../src/data/schema';
import { trainingWorkoutsQuery } from '../src/data/queries';

function open() {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys=ON');
  return database;
}
function migrate(database: DatabaseSync) {
  const current = database.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let index = current.user_version; index < migrations.length; index++) {
    database.exec('BEGIN');
    try {
      database.exec(migrations[index]);
      database.exec(`PRAGMA user_version=${index + 1}`);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }
}
function addProfile(database: DatabaseSync) {
  database.prepare('INSERT INTO profile VALUES (?,?,?,?,?,?,?,?,?,?,?)').run('p', 'Alex', '1990-01-01', 175, 80, 75, 'Beginner', 'Improve general fitness', 'Build discipline', 'en', 'now');
}

describe('SQLite persistence schema', () => {
  it('initializes the current schema once and seeds only static exercise definitions', () => {
    const database = open();
    migrate(database);
    migrate(database);
    expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(migrations.length);
    expect((database.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get() as { n: number }).n).toBeGreaterThan(10);
    expect(exerciseSeeds.length).toBeGreaterThan(0);
    database.close();
  });

  it('adds the notification config migration without replacing existing schedule rows', () => {
    const database = open();
    database.exec(migrations[0]);
    database.exec('PRAGMA user_version=1');
    database.prepare('INSERT INTO notification_schedules (key, notification_id) VALUES (?,?)').run('habit:h', 'native-id');
    migrate(database);
    expect(database.prepare('SELECT key,notification_id,config FROM notification_schedules').get()).toEqual({ key: 'habit:h', notification_id: 'native-id', config: '' });
    database.close();
  });

  it('preserves existing workout sets as completed when adding per-set status', () => {
    const database = open();
    database.exec(migrations[0]); database.exec(migrations[1]); database.exec('PRAGMA user_version=2');
    addProfile(database);
    database.prepare('INSERT INTO exercises VALUES (?,?,?,?)').run('bench', 'Bench Press', 'weight_reps', 0);
    database.prepare('INSERT INTO workouts VALUES (?,?,?,?,?,?,?,?,?)').run('w', 'p', 'Session', '2026-11-02', '2026-11-02T12:00:00Z', 30, '', 1, 'now');
    database.prepare('INSERT INTO workout_exercises VALUES (?,?,?,?)').run('we', 'w', 'bench', 0);
    database.prepare('INSERT INTO workout_sets VALUES (?,?,?,?,?,?,?)').run('s', 'we', 1, 8, 50, null, '');
    migrate(database);
    expect(database.prepare('SELECT reps,weight_kg,completed FROM workout_sets WHERE id=?').get('s')).toEqual({ reps: 8, weight_kg: 50, completed: 1 });
    expect((database.prepare(trainingWorkoutsQuery).all() as { id: string }[]).map(row => row.id)).toEqual(['w']);
    database.close();
  });

  it('supports profile, weight, and habit completion CRUD with duplicate protection and cascades', () => {
    const database = open(); migrate(database); addProfile(database);
    database.prepare('INSERT INTO weights VALUES (?,?,?,?,?,?)').run('w', 'p', '2026-11-02', 80, '', 'now');
    database.prepare('UPDATE weights SET kg=? WHERE id=?').run(79.5, 'w');
    expect((database.prepare('SELECT kg FROM weights WHERE id=?').get('w') as { kg: number }).kg).toBe(79.5);
    database.prepare('INSERT INTO habits VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run('h', 'p', 'Read', '', 'Learning', '✓', 'daily', '', 7, '2026-11-02', 0, null, 'now');
    database.prepare('INSERT INTO habit_completions VALUES (?,?,?,?)').run('c', 'h', '2026-11-02', 'now');
    expect(() => database.prepare('INSERT INTO habit_completions VALUES (?,?,?,?)').run('c2', 'h', '2026-11-02', 'now')).toThrow();
    database.prepare('DELETE FROM habits WHERE id=?').run('h');
    expect((database.prepare('SELECT COUNT(*) AS n FROM habit_completions').get() as { n: number }).n).toBe(0);
    database.close();
  });

  it('enforces foreign keys and rolls back partially written workout bundles', () => {
    const database = open(); migrate(database); addProfile(database);
    database.exec('BEGIN');
    try {
      database.prepare('INSERT INTO workouts VALUES (?,?,?,?,?,?,?,?,?)').run('w', 'p', 'Session', '2026-11-02', '2026-11-02T12:00:00Z', 30, '', 1, 'now');
      database.prepare('INSERT INTO workout_exercises VALUES (?,?,?,?)').run('e', 'w', 'missing-exercise', 0);
      database.exec('COMMIT');
    } catch {
      database.exec('ROLLBACK');
    }
    expect((database.prepare('SELECT COUNT(*) AS n FROM workouts').get() as { n: number }).n).toBe(0);
    expect(() => database.prepare('INSERT INTO weights VALUES (?,?,?,?,?,?)').run('bad', 'missing-profile', '2026-11-02', 80, '', 'now')).toThrow();
    database.close();
  });

  it('counts only completed workout sessions with at least one recorded set and orders newest day first', () => {
    const database = open(); migrate(database); addProfile(database);
    database.prepare('INSERT INTO exercises VALUES (?,?,?,?)').run('bench', 'Bench Press', 'weight_reps', 0);
    const addWorkout = (id: string, day: string, completed: number) => database.prepare('INSERT INTO workouts VALUES (?,?,?,?,?,?,?,?,?)').run(id, 'p', id, day, `${day}T12:00:00Z`, 30, '', completed, `${day}T12:00:00Z`);
    addWorkout('empty', '2026-11-01', 1); addWorkout('draft', '2026-11-03', 0); addWorkout('valid-old', '2026-11-02', 1); addWorkout('valid-new', '2026-11-03', 1);
    database.prepare('INSERT INTO workout_exercises VALUES (?,?,?,?)').run('link-old', 'valid-old', 'bench', 0);
    database.prepare('INSERT INTO workout_sets (id,workout_exercise_id,set_number,reps,weight_kg,duration_sec,note) VALUES (?,?,?,?,?,?,?)').run('set-old', 'link-old', 1, 8, 50, null, '');
    database.prepare('INSERT INTO workout_exercises VALUES (?,?,?,?)').run('link-new', 'valid-new', 'bench', 0);
    database.prepare('INSERT INTO workout_sets (id,workout_exercise_id,set_number,reps,weight_kg,duration_sec,note) VALUES (?,?,?,?,?,?,?)').run('set-new', 'link-new', 1, 10, 55, null, '');
    const rows = database.prepare(trainingWorkoutsQuery).all() as { id: string }[];
    expect(rows.map(row => row.id)).toEqual(['valid-new', 'valid-old']);
    database.prepare('UPDATE workout_sets SET completed=0 WHERE id=?').run('set-old');
    expect((database.prepare(trainingWorkoutsQuery).all() as { id: string }[]).map(row => row.id)).toEqual(['valid-new']);
    database.prepare('DELETE FROM workouts WHERE id=?').run('valid-new');
    expect((database.prepare('SELECT COUNT(*) AS n FROM workout_sets').get() as { n: number }).n).toBe(1);
    database.close();
  });

  it('keeps routine edits separate from saved workout history and cascades deleted sessions', () => {
    const database = open(); migrate(database); addProfile(database);
    database.prepare('INSERT INTO exercises VALUES (?,?,?,?)').run('bench', 'Bench Press', 'weight_reps', 0);
    database.prepare('INSERT INTO exercises VALUES (?,?,?,?)').run('squat', 'Squat', 'weight_reps', 0);
    database.prepare('INSERT INTO routines VALUES (?,?,?,?)').run('r', 'p', 'Upper body', 'now');
    database.prepare('INSERT INTO routine_exercises VALUES (?,?,?,?)').run('re', 'r', 'bench', 0);
    database.prepare('INSERT INTO workouts VALUES (?,?,?,?,?,?,?,?,?)').run('w', 'p', 'Upper body', '2026-11-02', '2026-11-02T12:00:00Z', 40, '', 1, 'now');
    database.prepare('INSERT INTO workout_exercises VALUES (?,?,?,?)').run('we', 'w', 'bench', 0);
    database.prepare('INSERT INTO workout_sets (id,workout_exercise_id,set_number,reps,weight_kg,duration_sec,note) VALUES (?,?,?,?,?,?,?)').run('s', 'we', 1, 8, 50, null, '');
    database.exec('BEGIN');
    database.prepare('UPDATE routines SET name=? WHERE id=?').run('Lower body', 'r');
    database.prepare('DELETE FROM routine_exercises WHERE routine_id=?').run('r');
    database.prepare('INSERT INTO routine_exercises VALUES (?,?,?,?)').run('re2', 'r', 'squat', 0);
    database.exec('COMMIT');
    expect((database.prepare('SELECT exercise_id FROM workout_exercises WHERE workout_id=?').get('w') as { exercise_id: string }).exercise_id).toBe('bench');
    expect((database.prepare('SELECT weight_kg FROM workout_sets WHERE id=?').get('s') as { weight_kg: number }).weight_kg).toBe(50);
    database.prepare('DELETE FROM workouts WHERE id=?').run('w');
    expect((database.prepare('SELECT COUNT(*) AS n FROM workout_sets').get() as { n: number }).n).toBe(0);
    database.close();
  });

  it('keeps manual mission completion date-specific, unique, and cascading', () => {
    const database = open(); migrate(database); addProfile(database);
    database.prepare('INSERT INTO missions VALUES (?,?,?,?,?,?,?,?)').run('m', 'p', 'Read', 'manual', 1, 'daily', 1, 'now');
    database.prepare('INSERT INTO mission_completions VALUES (?,?,?)').run('c', 'm', '2026-11-02');
    expect(() => database.prepare('INSERT INTO mission_completions VALUES (?,?,?)').run('c2', 'm', '2026-11-02')).toThrow();
    expect((database.prepare('SELECT COUNT(*) AS n FROM mission_completions WHERE day=?').get('2026-11-03') as { n: number }).n).toBe(0);
    database.prepare('DELETE FROM missions WHERE id=?').run('m');
    expect((database.prepare('SELECT COUNT(*) AS n FROM mission_completions').get() as { n: number }).n).toBe(0);
    database.close();
  });
});
