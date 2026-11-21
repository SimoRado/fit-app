import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import catalogRows from '../src/data/catalog/exercises.json';
import sourceAliases from '../src/data/catalog/source-aliases.json';
import { exerciseSearchStatement, fitExerciseId, importExerciseCatalog, normalizeExerciseText } from '../src/data/exerciseCatalog';
import { exerciseSeeds, migrations } from '../src/data/schema';

function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON');
  migrations.forEach(migration => sql.exec(migration));
  for (const [id, name] of exerciseSeeds) sql.prepare('INSERT INTO exercises VALUES (?,?,?,0)').run(id, name, id === 'pullup' ? 'reps' : 'weight_reps');
  const adapter = {
    getFirstAsync: async <T>(query: string, ...args: unknown[]) => sql.prepare(query).get(...args as []) as T | null,
    withExclusiveTransactionAsync: async <T>(callback: (transaction: { runAsync: (query: string, ...args: unknown[]) => Promise<unknown> }) => Promise<T>) => {
      sql.exec('BEGIN');
      try {
        const result = await callback({ runAsync: async (query, ...args) => sql.prepare(query).run(...args as []) });
        sql.exec('COMMIT'); return result;
      } catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  } as unknown as SQLiteDatabase;
  return { sql, adapter };
}
function count(sql: DatabaseSync, table: string) { return (sql.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n; }
function search(sql: DatabaseSync, term = '', muscle = '', equipment = '', category = '') {
  const statement = exerciseSearchStatement(term, muscle, equipment, category);
  return sql.prepare(statement.sql).all(...statement.args as (string | number)[]) as { id: string; name: string }[];
}

describe('offline exercise catalog', () => {
  it('imports 1324 source identifiers without media, preserving IDs and saved references on repeat', async () => {
    const { sql, adapter } = database();
    sql.prepare('INSERT INTO profile VALUES (?,?,?,?,?,?,?,?,?,?,?)').run('owner', 'Alex', '1990-01-01', 175, 80, null, 'Beginner', 'Fitness', '', 'en', 'now');
    sql.prepare('INSERT INTO routines VALUES (?,?,?,?)').run('routine', 'owner', 'Upper', 'now');
    sql.prepare('INSERT INTO routine_exercises VALUES (?,?,?,?)').run('link', 'routine', 'pullup', 0);
    sql.prepare('INSERT INTO workouts (id,owner_id,name,day,started_at,notes,completed,created_at) VALUES (?,?,?,?,?,?,?,?)').run('workout', 'owner', 'Upper', '2026-11-01', '2026-11-01T12:00:00Z', '', 1, 'now');
    sql.prepare('INSERT INTO workout_exercises VALUES (?,?,?,?)').run('worked', 'workout', 'pullup', 0);
    sql.prepare('INSERT INTO workout_sets (id,workout_exercise_id,set_number,reps,weight_kg,duration_sec,note) VALUES (?,?,?,?,?,?,?)').run('set', 'worked', 1, 8, null, null, '');
    await importExerciseCatalog(adapter);
    expect(catalogRows).toHaveLength(1321);
    expect(sourceAliases).toHaveLength(3);
    expect(count(sql, 'exercise_catalog')).toBe(1321);
    expect(count(sql, 'exercise_catalog_sources')).toBe(1324);
    expect(count(sql, 'exercises')).toBe(1330);
    expect((sql.prepare('SELECT exercise_id FROM exercise_catalog_sources WHERE source_id=?').get('1628') as { exercise_id: string }).exercise_id).toBe('catalog:0454');
    expect((sql.prepare('SELECT exercise_id FROM exercise_catalog WHERE source_id=?').get('0652') as { exercise_id: string }).exercise_id).toBe('pullup');
    expect((sql.prepare('SELECT exercise_id FROM routine_exercises WHERE id=?').get('link') as { exercise_id: string }).exercise_id).toBe('pullup');
    expect((sql.prepare('SELECT exercise_id FROM workout_exercises WHERE id=?').get('worked') as { exercise_id: string }).exercise_id).toBe('pullup');
    expect(count(sql, 'workout_sets')).toBe(1);
    sql.prepare('INSERT INTO routine_exercises VALUES (?,?,?,?)').run('new-link', 'routine', 'catalog:0001', 1);
    sql.prepare('INSERT INTO workout_exercises VALUES (?,?,?,?)').run('new-worked', 'workout', 'catalog:0001', 1);
    expect((sql.prepare('SELECT exercise_id FROM routine_exercises WHERE id=?').get('new-link') as { exercise_id: string }).exercise_id).toBe('catalog:0001');
    expect((sql.prepare('SELECT exercise_id FROM workout_exercises WHERE id=?').get('new-worked') as { exercise_id: string }).exercise_id).toBe('catalog:0001');
    await importExerciseCatalog(adapter);
    expect(count(sql, 'exercise_catalog')).toBe(1321);
    expect(count(sql, 'exercises')).toBe(1330);
    expect(sql.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(catalogRows.every(row => !('image' in row) && !('gif_url' in row) && !('media_id' in row))).toBe(true);
    sql.close();
  });
  it('searches names, muscles, equipment and categories and retains translated instructions', async () => {
    const { sql, adapter } = database();
    await importExerciseCatalog(adapter);
    expect(search(sql, 'pull up').some(row => row.id === 'pullup')).toBe(true);
    expect(search(sql, 'biceps').length).toBeGreaterThan(0);
    expect(search(sql, 'dumbbell').length).toBeGreaterThan(0);
    expect(search(sql, 'chest').length).toBeGreaterThan(0);
    expect(search(sql, '', 'core').length).toBeGreaterThan(0);
    expect(search(sql, '', '', 'bodyweight').length).toBeGreaterThan(0);
    const detail = sql.prepare('SELECT instructions,instruction_steps,media_uri FROM exercise_catalog WHERE source_id=?').get('0001') as { instructions: string; instruction_steps: string; media_uri: null };
    expect(JSON.parse(detail.instructions).fr.length).toBeGreaterThan(0);
    expect(JSON.parse(detail.instruction_steps).en.length).toBeGreaterThan(0);
    expect(detail.media_uri).toBeNull();
    expect(fitExerciseId('0001', '3/4 sit-up')).toBe('catalog:0001');
    sql.close();
  });
  it('updates on one-character and multiword input with case, punctuation, accents, and name relevance', async () => {
    const { sql, adapter } = database();
    await importExerciseCatalog(adapter);
    const oneCharacter = search(sql, 'l');
    expect(oneCharacter.length).toBeGreaterThan(0);
    expect(oneCharacter[0].name.toLowerCase().startsWith('l')).toBe(true);
    expect(search(sql, 'LAT PULLDOWN')[0].name.toLowerCase()).toBe('lat pulldown');
    expect(search(sql, 'lat-pulldown')[0].name.toLowerCase()).toBe('lat pulldown');
    expect(normalizeExerciseText('Crème-brûlée')).toBe('creme brulee');
    expect(search(sql, 'dumbbell press').length).toBeGreaterThan(0);
    sql.close();
  });
  it('combines name search with filters and keeps saved exercise identifiers', async () => {
    const { sql, adapter } = database();
    await importExerciseCatalog(adapter);
    const match = sql.prepare("SELECT muscle_group_key,equipment_key,category FROM exercise_catalog WHERE search_text LIKE 'dumbbell%' LIMIT 1").get() as { muscle_group_key: string; equipment_key: string; category: string };
    expect(match).toBeTruthy();
    const filtered = search(sql, 'dumbbell', match.muscle_group_key, match.equipment_key, match.category);
    expect(filtered.length).toBeGreaterThan(0);
    const saved = filtered[0];
    expect(saved.id).toMatch(/^catalog:\d{4}$/);
    expect(sql.prepare('SELECT id FROM exercises WHERE id=?').get(saved.id)).toBeTruthy();
    sql.close();
  });
  it('can show seed and custom matches before the full local catalog import finishes', () => {
    const { sql } = database();
    sql.prepare('INSERT INTO exercises VALUES (?,?,?,1)').run('user-row', 'Lat Raise Custom', 'weight_reps');
    const statement = exerciseSearchStatement('lat', '', '', '', 60, ['lat']);
    const rows = sql.prepare(statement.sql).all(...statement.args as (string | number)[]) as { id: string; name: string; custom: number }[];
    expect(rows.map(row => row.id)).toContain('lat');
    expect(rows.map(row => row.id)).toContain('user-row');
    expect(rows.every(row => row.id === 'lat' || row.custom === 1)).toBe(true);
    sql.close();
  });
  it('keeps catalog and custom exercises in separate per-account databases', async () => {
    const first = database(); const second = database();
    await importExerciseCatalog(first.adapter); await importExerciseCatalog(second.adapter);
    first.sql.prepare('INSERT INTO exercises VALUES (?,?,?,1)').run('user-exercise', 'My movement', 'reps');
    expect(count(first.sql, 'exercises')).toBe(1331);
    expect(count(second.sql, 'exercises')).toBe(1330);
    expect(second.sql.prepare('SELECT id FROM exercises WHERE id=?').get('user-exercise')).toBeUndefined();
    first.sql.close(); second.sql.close();
  });
});
