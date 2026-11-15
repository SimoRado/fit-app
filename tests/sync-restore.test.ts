/// <reference types="vite/client" />
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { migrations } from '../src/data/schema';
import type { CloudRow } from '../src/data/syncOrder';

const fixture = vi.hoisted(() => ({ account: 'user_A', database: null as unknown }));
vi.mock('expo-sqlite', () => ({}));
vi.mock('../src/data/db', () => ({
  db: async () => fixture.database,
  getLocalAccount: () => fixture.account,
  ensureExerciseCatalog: async () => {},
}));
import { applyCloud } from '../src/data/syncLocal';

type TestDb = {
  getFirstAsync: (sql: string, ...args: (string | number | null)[]) => Promise<unknown>;
  runAsync: (sql: string, ...args: (string | number | null)[]) => Promise<unknown>;
  execAsync: (sql: string) => Promise<void>;
  withExclusiveTransactionAsync: (task: (tx: TestDb) => Promise<void>) => Promise<void>;
};

function adapter(raw: DatabaseSync) {
  const connection: TestDb = {
    getFirstAsync: async (sql: string, ...args: (string | number | null)[]) => raw.prepare(sql).get(...args) ?? null,
    runAsync: async (sql: string, ...args: (string | number | null)[]) => raw.prepare(sql).run(...args),
    execAsync: async (sql: string) => { raw.exec(sql); },
    withExclusiveTransactionAsync: async task => {
      raw.exec('BEGIN IMMEDIATE');
      try { await task(connection); raw.exec('COMMIT'); }
      catch (cause) { raw.exec('ROLLBACK'); throw cause; }
    },
  };
  return connection;
}

const profile = { id: 'profile-1', name: 'Test', birth_date: '1995-01-01', height_cm: 170, start_weight: 75, target_weight: null, experience: 'Beginner', fitness_goal: 'Health', growth_goals: '', language: 'en', completed_at: '2026-11-15T12:00:00.000Z' };
const food = { id: 'entry-1', owner_id: profile.id, food_id: null, day: '2026-11-15', meal: 'lunch', name: 'Test food', grams: 150, kcal: 200, protein: 10, carbs: 20, fat: 5, kcal_100: 133, protein_100: 6.67, carbs_100: 13.33, fat_100: 3.33, created_at: '2026-11-15T12:00:00.000Z', catalog_food_id: 'fd_2dObzdqa6o2J' };
const target = { id: 'profile-1:2026-11-15', owner_id: profile.id, effective_day: '2026-11-15', kcal: 2500, protein: 100, carbs: 300, fat: 70, created_at: '2026-11-15T12:00:00.000Z' };
const workout = { id: 'workout-1', owner_id: profile.id, name: 'Test', day: '2026-11-15', started_at: '2026-11-15T12:00:00.000Z', duration_min: null, notes: '', completed: 0, created_at: '2026-11-15T12:00:00.000Z', session_status: 'paused', elapsed_seconds: 60, running_since_ms: null, paused_since_ms: 1794744060000, paused_seconds: 10, finished_at_ms: null };
const cloud = (kind: CloudRow['kind'], id: string, payload: object | null, revision = 1): CloudRow => ({ kind, clientId: id, payload: payload === null ? null : JSON.stringify(payload), revision, deleted: payload === null });

describe('cloud restore into account SQLite', () => {
  let raw: DatabaseSync;
  beforeEach(() => {
    fixture.account = 'user_A';
    raw = new DatabaseSync(':memory:');
    for (const migration of migrations) raw.exec(migration);
    raw.exec("UPDATE sync_control SET choice='enabled' WHERE id=1");
    fixture.database = adapter(raw);
  });
  it('restores food, targets, preferences and session state once, then preserves a pending local edit', async () => {
    const rows = [cloud('food_entries', food.id, food), cloud('workouts', workout.id, workout), cloud('nutrition_targets', target.id, target), cloud('preferences', 'nutrition:calorie-display', { key: 'nutrition:calorie-display', value: 'remaining' }), cloud('profile', profile.id, profile)];
    expect(await applyCloud(rows, 'user_A')).toEqual({ applied: 5, conflicts: 0 });
    expect(raw.prepare('SELECT day,meal,grams,kcal,protein,carbs,fat,catalog_food_id FROM food_entries WHERE id=?').get(food.id)).toEqual({ day: food.day, meal: food.meal, grams: food.grams, kcal: food.kcal, protein: food.protein, carbs: food.carbs, fat: food.fat, catalog_food_id: food.catalog_food_id });
    expect(raw.prepare('SELECT kcal,protein,carbs,fat FROM nutrition_targets WHERE id=?').get(target.id)).toEqual({ kcal: 2500, protein: 100, carbs: 300, fat: 70 });
    expect(raw.prepare('SELECT value FROM preferences WHERE key=?').get('nutrition:calorie-display')?.value).toBe('remaining');
    expect(raw.prepare('SELECT session_status,elapsed_seconds,paused_since_ms FROM workouts WHERE id=?').get(workout.id)).toEqual({ session_status: 'paused', elapsed_seconds: 60, paused_since_ms: 1794744060000 });
    expect(await applyCloud(rows, 'user_A')).toEqual({ applied: 0, conflicts: 0 });
    raw.prepare('UPDATE food_entries SET grams=200 WHERE id=?').run(food.id);
    expect(raw.prepare("SELECT count(*) AS n FROM sync_outbox WHERE kind='food_entries'").get()?.n).toBe(1);
    expect(await applyCloud([cloud('food_entries', food.id, { ...food, grams: 175 }, 2)], 'user_A')).toEqual({ applied: 0, conflicts: 1 });
    expect(raw.prepare('SELECT grams FROM food_entries WHERE id=?').get(food.id)?.grams).toBe(200);
    raw.close();
  });
  it('rejects a different account and applies a cloud deletion without recreating the row', async () => {
    await expect(applyCloud([cloud('profile', profile.id, profile)], 'user_B')).rejects.toThrow('Account changed');
    await applyCloud([cloud('profile', profile.id, profile), cloud('food_entries', food.id, food)], 'user_A');
    expect(await applyCloud([cloud('food_entries', food.id, null, 2)], 'user_A')).toEqual({ applied: 1, conflicts: 0 });
    expect(raw.prepare('SELECT count(*) AS n FROM food_entries').get()?.n).toBe(0);
    expect(await applyCloud([cloud('food_entries', food.id, null, 2)], 'user_A')).toEqual({ applied: 0, conflicts: 0 });
    raw.close();
  });
});
