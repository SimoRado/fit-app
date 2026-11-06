/// <reference types="vite/client" />
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import { api } from '../convex/_generated/api';
import cloudSchema from '../convex/schema';
import { migrations } from '../src/data/schema';
import { cloudUpsertSql } from '../src/data/syncSql';
import { orderOutbox, type OutboxRow } from '../src/data/syncOrder';
import { calorieBalance, nutritionWeek, parseNumber, portionNutrients, sumNutrients, validateFood, weekStats } from '../src/core/nutrition';

const modules = import.meta.glob('../convex/**/*.{ts,js}');
const stamp = '2026-11-06T12:00:00.000Z';
const profile = { id: 'profile-n', name: 'Test', birth_date: '1990-01-01', height_cm: 170, start_weight: 70, target_weight: null, experience: 'Beginner', fitness_goal: 'Health', growth_goals: '', language: 'en', completed_at: stamp };
const food = { id: 'food-n', owner_id: profile.id, name: 'User food', kcal_100: 165, protein_100: 31, carbs_100: 0, fat_100: 3.6, created_at: stamp };
const entry = { id: 'entry-n', owner_id: profile.id, food_id: food.id, day: '2026-11-06', meal: 'lunch', name: food.name, grams: 200, kcal: 330, protein: 62, carbs: 0, fat: 7.2, kcal_100: 165, protein_100: 31, carbs_100: 0, fat_100: 3.6, created_at: stamp };
const op = (n: number) => n.toString(16).padStart(32, '0');
const open = () => { const d = new DatabaseSync(':memory:'); d.exec('PRAGMA foreign_keys=ON'); for (const migration of migrations) d.exec(migration); return d; };

describe('nutrition calculations and validation', () => {
  it('adds calories and macros without capping an over-target day', () => {
    const totals = sumNutrients([{ kcal: 411, protein: 24.5, carbs: 30, fat: 11 }, { kcal: 1839, protein: 50, carbs: 120, fat: 60 }]);
    expect(totals).toEqual({ kcal: 2250, protein: 74.5, carbs: 150, fat: 71 });
    expect(calorieBalance(2000, 411)).toEqual({ amount: 1589, label: 'KCAL LEFT', over: false });
    expect(calorieBalance(2000, totals.kcal)).toEqual({ amount: 250, label: 'KCAL OVER', over: true });
  });
  it('scales a user-supplied per-100 g reference without repeated rounding', () => {
    expect(portionNutrients({ kcal: 165, protein: 31, carbs: 0, fat: 3.6 }, 200)).toEqual({ kcal: 330, protein: 62, carbs: 0, fat: 7.2 });
  });
  it('uses local calendar dates across month boundaries and skips unlogged days', () => {
    expect(nutritionWeek('2026-03-02')).toEqual(['2026-02-24','2026-02-25','2026-02-26','2026-02-27','2026-02-28','2026-03-01','2026-03-02']);
    const stats = weekStats([{ logged: true, nutrients: { kcal: 1900, protein: 90, carbs: 200, fat: 60 }, target: { kcal: 2000, protein: 100, carbs: 200, fat: 60 } }, { logged: false, nutrients: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, target: null }]);
    expect(stats).toMatchObject({ loggedDays: 1, nearTarget: 1, proteinDays: 1, average: { kcal: 1900 } });
  });
  it('rejects missing and invalid manual values', () => {
    expect(() => parseNumber('', 'Calories', 10000)).toThrow();
    expect(() => parseNumber('-2', 'Fat', 2000)).toThrow();
    expect(() => validateFood({ name: ' ', day: '2026-11-06', meal: 'lunch', kcal: 0, protein: 0, carbs: 0, fat: 0 })).toThrow();
    expect(() => validateFood({ name: 'Food', day: '2026-02-30', meal: 'lunch', kcal: 0, protein: 0, carbs: 0, fat: 0 })).toThrow();
  });
});

describe('nutrition SQLite migration and queue', () => {
  it('uploads saved foods before diary entries and deletes entries before foods', () => {
    const row = (kind: OutboxRow['kind'], action: OutboxRow['action']): OutboxRow => ({ kind, action, record_id: 'x', operation_id: op(200), conflict: 0 });
    expect(orderOutbox([row('food_entries','upsert'), row('custom_foods','upsert'), row('custom_foods','delete'), row('food_entries','delete')]).map(item => `${item.action}:${item.kind}`)).toEqual(['upsert:custom_foods','upsert:food_entries','delete:food_entries','delete:custom_foods']);
  });
  it('preserves existing profile rows and supports edit, delete, and historical target lookup', () => {
    const d = new DatabaseSync(':memory:');
    d.exec('PRAGMA foreign_keys=ON');
    for (const migration of migrations.slice(0, -1)) d.exec(migration);
    d.prepare('INSERT INTO profile VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(...Object.values(profile));
    d.exec(migrations.at(-1)!);
    expect(d.prepare('SELECT id FROM profile').get()).toEqual({ id: profile.id });
    d.prepare('INSERT INTO nutrition_targets VALUES (?,?,?,?,?,?,?,?)').run(`${profile.id}:2026-11-01`, profile.id, '2026-11-01', 2000, 100, 220, 65, stamp);
    d.prepare('INSERT INTO nutrition_targets VALUES (?,?,?,?,?,?,?,?)').run(`${profile.id}:2026-11-06`, profile.id, '2026-11-06', 2200, 110, 250, 70, stamp);
    expect(d.prepare('SELECT kcal FROM nutrition_targets WHERE owner_id=? AND effective_day<=? ORDER BY effective_day DESC LIMIT 1').get(profile.id, '2026-11-05')).toEqual({ kcal: 2000 });
    d.prepare('INSERT INTO custom_foods VALUES (?,?,?,?,?,?,?,?)').run(...Object.values(food));
    d.prepare('INSERT INTO food_entries VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...Object.values(entry));
    d.prepare('UPDATE food_entries SET kcal=? WHERE id=?').run(340, entry.id);
    expect(d.prepare('SELECT kcal FROM food_entries WHERE id=?').get(entry.id)).toEqual({ kcal: 340 });
    d.prepare('DELETE FROM food_entries WHERE id=?').run(entry.id);
    expect(d.prepare('SELECT COUNT(*) AS n FROM food_entries').get()).toEqual({ n: 0 });
    const restore = d.prepare(cloudUpsertSql('food_entries', Object.keys(entry), 'id'));
    restore.run(...Object.values(entry));
    restore.run(...Object.values(entry));
    expect(d.prepare('SELECT COUNT(*) AS n FROM food_entries').get()).toEqual({ n: 1 });
    d.close();
  });
  it('queues offline nutrition writes only after sync consent and scopes foreign keys', () => {
    const d = open();
    d.prepare('INSERT INTO profile VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(...Object.values(profile));
    d.prepare('INSERT INTO custom_foods VALUES (?,?,?,?,?,?,?,?)').run(...Object.values(food));
    expect(d.prepare('SELECT COUNT(*) AS n FROM sync_outbox').get()).toEqual({ n: 0 });
    d.exec("UPDATE sync_control SET choice='enabled' WHERE id=1");
    d.prepare('INSERT INTO food_entries VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...Object.values(entry));
    expect(d.prepare('SELECT action FROM sync_outbox WHERE kind=? AND record_id=?').get('food_entries', entry.id)).toEqual({ action: 'upsert' });
    expect(() => d.prepare('INSERT INTO nutrition_preferences VALUES (?,?)').run('other-profile', 1)).toThrow();
    d.prepare('DELETE FROM food_entries WHERE id=?').run(entry.id);
    expect(d.prepare('SELECT action FROM sync_outbox WHERE kind=? AND record_id=?').get('food_entries', entry.id)).toEqual({ action: 'delete' });
    d.close();
  });
  it('retains diary data and queued changes after reopening the local database', () => {
    const folder = mkdtempSync(join(tmpdir(), 'fit-nutrition-'));
    const file = join(folder, 'account.db');
    try {
      const first = new DatabaseSync(file);
      first.exec('PRAGMA foreign_keys=ON');
      for (const migration of migrations) first.exec(migration);
      first.prepare('INSERT INTO profile VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(...Object.values(profile));
      first.exec("UPDATE sync_control SET choice='enabled' WHERE id=1");
      first.prepare('INSERT INTO custom_foods VALUES (?,?,?,?,?,?,?,?)').run(...Object.values(food));
      first.prepare('INSERT INTO food_entries VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...Object.values(entry));
      first.close();
      const reopened = new DatabaseSync(file);
      expect(reopened.prepare('SELECT kcal,protein FROM food_entries WHERE id=?').get(entry.id)).toEqual({ kcal: 330, protein: 62 });
      expect(reopened.prepare("SELECT COUNT(*) AS n FROM sync_outbox WHERE kind IN ('custom_foods','food_entries')").get()).toEqual({ n: 2 });
      reopened.close();
    } finally { rmSync(file, { force: true }); rmdirSync(folder); }
  });
});

describe('nutrition Convex ownership', () => {
  it('requires Clerk identity, validates parent ownership and deduplicates retries', async () => {
    const t = convexTest(cloudSchema, modules);
    const args = { kind: 'profile' as const, clientId: profile.id, payload: JSON.stringify(profile), expectedRevision: 0, operationId: op(100) };
    await expect(t.mutation(api.sync.apply, args)).rejects.toThrow('Authentication required');
    const a = t.withIdentity({ subject: 'nutrition_A', issuer: 'https://clerk.example' });
    const b = t.withIdentity({ subject: 'nutrition_B', issuer: 'https://clerk.example' });
    await a.mutation(api.sync.apply, args);
    const foodArgs = { kind: 'custom_foods' as const, clientId: food.id, payload: JSON.stringify(food), expectedRevision: 0, operationId: op(101) };
    await expect(b.mutation(api.sync.apply, foodArgs)).rejects.toThrow('Parent record is not synchronized');
    expect(await a.mutation(api.sync.apply, foodArgs)).toEqual({ status: 'applied', revision: 1 });
    expect(await a.mutation(api.sync.apply, foodArgs)).toEqual({ status: 'applied', revision: 1 });
    const entryArgs = { kind: 'food_entries' as const, clientId: entry.id, payload: JSON.stringify(entry), expectedRevision: 0, operationId: op(102) };
    expect(await a.mutation(api.sync.apply, entryArgs)).toEqual({ status: 'applied', revision: 1 });
    expect((await b.query(api.sync.page, { paginationOpts: { numItems: 10, cursor: null } })).page).toHaveLength(0);
  });
});
