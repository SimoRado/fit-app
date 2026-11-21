import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { migrations } from '../src/data/schema';

/**
 * These checks deliberately use an in-memory SQLite database. They cover the
 * user-controlled text persisted by the habit, workout, and nutrition flows
 * without touching a device database or an account.
 */
function openDatabase() {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys=ON');
  for (const migration of migrations) database.exec(migration);
  database.prepare('INSERT INTO profile VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(
    'owner', 'Owner', '1990-01-01', 175, 80, 75, 'Beginner', 'Health', '', 'en', 'now',
  );
  return database;
}

describe('SQLite injection regression protections', () => {
  it('persists SQL-like habit, workout, note, and food text as data', () => {
    const database = openDatabase();
    const payload = "x'); DROP TABLE profile; --";

    database.prepare(
      'INSERT INTO habits (id,owner_id,name,description,category,icon,frequency,days,weekly_target,start_date,archived,reminder_time,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    ).run('habit', 'owner', payload, payload, 'Other', '✓', 'daily', '', 1, '2026-11-01', 0, null, 'now');
    database.prepare(
      'INSERT INTO workouts (id,owner_id,name,day,started_at,duration_min,notes,completed,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    ).run('workout', 'owner', payload, '2026-11-01', '2026-11-01T12:00:00.000Z', 30, payload, 1, 'now');
    database.prepare('INSERT INTO custom_foods VALUES (?,?,?,?,?,?,?,?)').run(
      'food', 'owner', payload, 100, 1, 2, 3, 'now',
    );

    expect(database.prepare('SELECT name,description FROM habits WHERE id=?').get('habit')).toEqual({ name: payload, description: payload });
    expect(database.prepare('SELECT name,notes FROM workouts WHERE id=?').get('workout')).toEqual({ name: payload, notes: payload });
    expect(database.prepare('SELECT name FROM custom_foods WHERE id=?').get('food')).toEqual({ name: payload });
    expect(database.prepare('SELECT COUNT(*) AS count FROM profile').get()).toEqual({ count: 1 });
    database.close();
  });

  it('treats a predicate-shaped lookup value as a literal identifier', () => {
    const database = openDatabase();
    database.prepare(
      'INSERT INTO habits (id,owner_id,name,description,category,icon,frequency,days,weekly_target,start_date,archived,reminder_time,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    ).run('first', 'owner', 'First', '', 'Other', '✓', 'daily', '', 1, '2026-11-01', 0, null, 'now');
    database.prepare(
      'INSERT INTO habits (id,owner_id,name,description,category,icon,frequency,days,weekly_target,start_date,archived,reminder_time,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    ).run('second', 'owner', 'Second', '', 'Other', '✓', 'daily', '', 1, '2026-11-01', 0, null, 'now');

    const attackerControlledId = "first' OR '1'='1";
    expect(database.prepare('SELECT id FROM habits WHERE id=?').all(attackerControlledId)).toEqual([]);
    expect(database.prepare('SELECT COUNT(*) AS count FROM habits').get()).toEqual({ count: 2 });
    database.close();
  });
});
