/// <reference types="vite/client" />
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import { migrations } from '../src/data/schema';
import { orderOutbox, upsertOrder, type OutboxRow, type SyncKind } from '../src/data/syncOrder';
import { syncTables } from '../src/data/syncSchema';
import { cloudUpsertSql } from '../src/data/syncSql';
import schema from '../convex/schema';
import { syncRecordFields } from '../convex/syncContract';
import { api } from '../convex/_generated/api';
import { adultAgreement } from './eligibilityFixture';

const modules = import.meta.glob('../convex/**/*.{ts,js}');
const profile = { id: 'profile-1', name: 'A', birth_date: '1995-01-01', height_cm: 170, start_weight: 75, target_weight: null, experience: 'Beginner', fitness_goal: 'Health', growth_goals: '', language: 'en', completed_at: '2026-11-05T00:00:00.000Z' };
const habit = { id: 'habit-1', owner_id: 'profile-1', name: 'Walk', description: '', category: 'Fitness', icon: '✓', frequency: 'daily', days: '', weekly_target: 3, start_date: '2026-11-05', archived: 0, reminder_time: null, created_at: '2026-11-05T00:00:00.000Z' };
const op = (n: number) => n.toString(16).padStart(32, '0');

describe('durable SQLite queue', () => {
  it('keeps every synchronized SQLite column in the strict server contract', () => {
    const db = new DatabaseSync(':memory:');
    for (const migration of migrations) db.exec(migration);
    for (const table of syncTables) {
      const columns = (db.prepare(`PRAGMA table_info(${table.name})`).all() as { name: string }[]).map(row => row.name);
      expect([...syncRecordFields[table.name]].sort(), table.name).toEqual(columns.sort());
    }
    db.close();
  });
  it('restores composite-key records, including rows with no mutable columns', () => {
    const db = new DatabaseSync(':memory:');
    for (const migration of migrations) db.exec(migration);
    db.prepare('INSERT INTO profile VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(...Object.values(profile));
    const sql = cloudUpsertSql('rest_days', ['owner_id','day'], 'owner_id,day');
    db.prepare(sql).run(profile.id, '2026-11-05');
    db.prepare(sql).run(profile.id, '2026-11-05');
    expect(db.prepare('SELECT count(*) AS n FROM rest_days').get()?.n).toBe(1);
    db.close();
  });
  it('does not enqueue before consent, then captures changes and deletions atomically', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    for (const migration of migrations) db.exec(migration);
    const insertProfile = db.prepare('INSERT INTO profile VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    insertProfile.run(...Object.values(profile));
    expect(db.prepare('SELECT count(*) AS n FROM sync_outbox').get()?.n).toBe(0);
    db.exec("UPDATE sync_control SET choice='enabled' WHERE id=1");
    db.prepare('UPDATE profile SET name=? WHERE id=?').run('Updated', profile.id);
    expect(db.prepare('SELECT action FROM sync_outbox WHERE kind=? AND record_id=?').get('profile', profile.id)?.action).toBe('upsert');
    db.prepare('INSERT INTO habits (id,owner_id,name,description,category,icon,frequency,days,weekly_target,start_date,archived,reminder_time,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...Object.values(habit));
    db.prepare('INSERT INTO habit_completions VALUES (?,?,?,?)').run('completion-1', habit.id, '2026-11-05', '2026-11-05T00:00:00.000Z');
    db.prepare('DELETE FROM habits WHERE id=?').run(habit.id);
    expect(db.prepare('SELECT action FROM sync_outbox WHERE kind=? AND record_id=?').get('habits', habit.id)?.action).toBe('delete');
    expect(db.prepare('SELECT action FROM sync_outbox WHERE kind=? AND record_id=?').get('habit_completions', `${habit.id}:2026-11-05`)?.action).toBe('delete');
    db.close();
  });

  it('uploads parents first and deletes children first', () => {
    const make = (kind: OutboxRow['kind'], action: OutboxRow['action']): OutboxRow => ({ kind, action, record_id: 'x', operation_id: op(1), conflict: 0 });
    expect(orderOutbox([make('habit_completions','upsert'),make('habits','upsert'),make('habits','delete'),make('habit_completions','delete')]).map(x => `${x.action}:${x.kind}`)).toEqual(['upsert:habits','upsert:habit_completions','delete:habit_completions','delete:habits']);
  });
  it('keeps queued changes after the database is closed and reopened offline', () => {
    const folder = mkdtempSync(join(tmpdir(), 'fitapp-sync-'));
    const file = join(folder, 'account.db');
    try {
      const first = new DatabaseSync(file);
      for (const migration of migrations) first.exec(migration);
      first.exec("UPDATE sync_control SET choice='enabled' WHERE id=1");
      first.prepare('INSERT INTO profile VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(...Object.values(profile));
      first.close();
      const reopened = new DatabaseSync(file);
      expect(reopened.prepare('SELECT kind,record_id,action FROM sync_outbox').get()).toMatchObject({ kind: 'profile', record_id: profile.id, action: 'upsert' });
      reopened.close();
    } finally { rmSync(file, { force: true }); rmdirSync(folder); }
  });
  it('keeps failure diagnostics across restart without acknowledging the operation', () => {
    const folder = mkdtempSync(join(tmpdir(), 'fitapp-sync-failure-'));
    const file = join(folder, 'account.db');
    try {
      const first = new DatabaseSync(file);
      for (const migration of migrations) first.exec(migration);
      first.exec("UPDATE sync_control SET choice='enabled' WHERE id=1");
      first.prepare('INSERT INTO profile VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(...Object.values(profile));
      const queued = first.prepare("SELECT kind,record_id,operation_id FROM sync_outbox WHERE kind='profile'").get() as { kind: string; record_id: string; operation_id: string };
      first.prepare('INSERT INTO sync_failures VALUES (?,?,?,?,?,?,?)').run(queued.kind, queued.record_id, queued.operation_id, 'validation', 'Rejected record', 1, 0);
      first.close();
      const reopened = new DatabaseSync(file);
      expect(reopened.prepare('SELECT count(*) AS n FROM sync_outbox').get()?.n).toBe(1);
      expect(reopened.prepare('SELECT category FROM sync_failures').get()?.category).toBe('validation');
      reopened.close();
    } finally { rmSync(file, { force: true }); rmdirSync(folder); }
  });
  it('records a failure only while its exact queued operation remains current', () => {
    const db = new DatabaseSync(':memory:');
    for (const migration of migrations) db.exec(migration);
    db.exec("UPDATE sync_control SET choice='enabled' WHERE id=1");
    db.prepare('INSERT INTO profile VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(...Object.values(profile));
    const queued = db.prepare("SELECT kind,record_id,operation_id FROM sync_outbox WHERE kind='profile'").get() as { kind: string; record_id: string; operation_id: string };
    const sql = `INSERT INTO sync_failures(kind,record_id,operation_id,category,detail,attempts,next_retry_at)
      SELECT kind,record_id,operation_id,?,?,?,? FROM sync_outbox WHERE kind=? AND record_id=? AND operation_id=?
      ON CONFLICT(kind,record_id,operation_id) DO UPDATE SET category=excluded.category,detail=excluded.detail,attempts=excluded.attempts,next_retry_at=excluded.next_retry_at`;
    db.prepare(sql).run('validation','Rejected',1,0,queued.kind,queued.record_id,queued.operation_id);
    expect(db.prepare('SELECT count(*) AS n FROM sync_failures').get()?.n).toBe(1);
    db.prepare('UPDATE profile SET name=? WHERE id=?').run('Updated', profile.id);
    db.prepare(sql).run('validation','Rejected',1,0,queued.kind,queued.record_id,queued.operation_id);
    const current = db.prepare("SELECT operation_id FROM sync_outbox WHERE kind='profile'").get() as { operation_id: string };
    expect(current.operation_id).not.toBe(queued.operation_id);
    expect(db.prepare('SELECT count(*) AS n FROM sync_failures WHERE operation_id=?').get(current.operation_id)?.n).toBe(0);
    db.close();
  });
});

describe('authenticated cloud sync', () => {
  it('accepts and deletes representative records for every synchronized entity', async () => {
    const local = new DatabaseSync(':memory:');
    local.exec('PRAGMA foreign_keys=ON');
    for (const migration of migrations) local.exec(migration);
    local.prepare('INSERT INTO profile VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(...Object.values(profile));
    local.exec(`
      INSERT INTO exercises VALUES ('exercise-1','Custom','weight_reps',1);
      INSERT INTO habits (id,owner_id,name,description,category,icon,frequency,days,weekly_target,start_date,archived,reminder_time,created_at,reminder_enabled,reminder_times) VALUES ('habit-1','profile-1','Walk','','Fitness','x','daily','',3,'2026-11-15',0,NULL,'2026-11-15T12:00:00.000Z',1,'["09:30"]');
      INSERT INTO habit_completions VALUES ('completion-1','habit-1','2026-11-15','2026-11-15T12:00:00.000Z');
      INSERT INTO habit_progress VALUES ('habit-1:2026-11-15','habit-1','2026-11-15',1,1,'','2026-11-15T12:00:00.000Z');
      INSERT INTO habit_days VALUES ('profile-1:2026-11-15','profile-1','2026-11-15','final','tracked',2,1,50,'[{"h":"habit-1","n":"Walk","i":"x","c":"Fitness","t":"b","d":1},{"h":"habit-2","n":"Water","i":"water","c":"Nutrition","t":"q","d":0,"g":3,"a":2,"u":"L"}]','2026-11-15T23:00:00.000Z');
      INSERT INTO missions VALUES ('mission-1','profile-1','Walk','manual',1,'daily',1,'2026-11-15T12:00:00.000Z');
      INSERT INTO mission_completions VALUES ('mission-completion-1','mission-1','2026-11-15');
      INSERT INTO routines VALUES ('routine-1','profile-1','Test','2026-11-15T12:00:00.000Z');
      INSERT INTO routine_exercises VALUES ('routine-exercise-1','routine-1','exercise-1',0);
      INSERT INTO workouts (id,owner_id,name,day,started_at,duration_min,notes,completed,created_at,session_status,elapsed_seconds,running_since_ms,paused_since_ms,paused_seconds,finished_at_ms) VALUES ('workout-1','profile-1','Test','2026-11-15','2026-11-15T12:00:00.000Z',NULL,'',0,'2026-11-15T12:00:00.000Z','running',60,1794744000000,NULL,0,NULL);
      INSERT INTO workout_exercises VALUES ('workout-exercise-1','workout-1','exercise-1',0);
      INSERT INTO workout_sets (id,workout_exercise_id,set_number,reps,weight_kg,duration_sec,note,completed) VALUES ('set-1','workout-exercise-1',1,10,20,NULL,'',1);
      INSERT INTO weights VALUES ('weight-1','profile-1','2026-11-15',75,'','2026-11-15T12:00:00.000Z');
      INSERT INTO measurements VALUES ('measurement-1','profile-1','2026-11-15','waist',80,'cm');
      INSERT INTO rest_days VALUES ('profile-1','2026-11-15');
      INSERT INTO favorites VALUES ('home','profile-1');
      INSERT INTO preferences VALUES ('nutrition:calorie-display','remaining');
      INSERT INTO nutrition_preferences VALUES ('profile-1',1);
      INSERT INTO nutrition_targets VALUES ('profile-1:2026-11-15','profile-1','2026-11-15',2000,100,200,60,'2026-11-15T12:00:00.000Z');
      INSERT INTO custom_foods VALUES ('custom-food-1','profile-1','Test food',100,1,20,1,'2026-11-15T12:00:00.000Z');
      INSERT INTO food_entries (id,owner_id,food_id,day,meal,name,grams,kcal,protein,carbs,fat,kcal_100,protein_100,carbs_100,fat_100,created_at,catalog_food_id) VALUES ('entry-1','profile-1','custom-food-1','2026-11-15','lunch','Test food',100,100,1,20,1,100,1,20,1,'2026-11-15T12:00:00.000Z','fd_2dObzdqa6o2J');
    `);
    const records = new Map<SyncKind, { id: string; payload: string }>();
    const idFor = (kind: SyncKind, row: Record<string, string | number | null>) => kind === 'preferences' ? String(row.key)
      : kind === 'nutrition_preferences' ? String(row.owner_id)
      : kind === 'favorites' ? `${row.owner_id}:${row.card_id}`
      : kind === 'rest_days' ? `${row.owner_id}:${row.day}`
      : kind === 'habit_completions' || kind === 'habit_progress' ? `${row.habit_id}:${row.day}`
      : kind === 'mission_completions' ? `${row.mission_id}:${row.day}` : String(row.id);
    for (const kind of upsertOrder) {
      const row = local.prepare(`SELECT * FROM ${kind}`).get() as Record<string, string | number | null>;
      expect(row, kind).toBeTruthy();
      records.set(kind, { id: idFor(kind, row), payload: JSON.stringify(row) });
    }
    local.close();
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: 'user_A', issuer: 'https://clerk.example' });
    await user.mutation(api.eligibility.accept, adultAgreement(profile.birth_date));
    for (const [index, kind] of upsertOrder.entries()) {
      const record = records.get(kind)!;
      expect(await user.mutation(api.sync.apply, { kind, clientId: record.id, payload: record.payload, expectedRevision: 0, operationId: op(100 + index) }), kind).toMatchObject({ status: 'applied', revision: 1 });
    }
    for (const [index, kind] of [...upsertOrder].reverse().entries()) {
      const record = records.get(kind)!;
      expect(await user.mutation(api.sync.apply, { kind, clientId: record.id, payload: null, expectedRevision: 1, operationId: op(200 + index) }), kind).toMatchObject({ status: 'applied', revision: 2 });
    }
    const page = await user.query(api.sync.page, { paginationOpts: { numItems: 100, cursor: null } });
    expect(page.page).toHaveLength(upsertOrder.length);
    expect(page.page.every(row => row.deleted)).toBe(true);
  });
  it('accepts current workout session fields, catalog food IDs and reminder times', async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: 'user_A', issuer: 'https://clerk.example' });
    await user.mutation(api.eligibility.accept, adultAgreement(profile.birth_date));
    await user.mutation(api.sync.apply, { kind: 'profile', clientId: profile.id, payload: JSON.stringify(profile), expectedRevision: 0, operationId: op(21) });
    const workout = { id: 'workout-1', owner_id: profile.id, name: 'Test', day: '2026-11-15', started_at: '2026-11-15T12:00:00.000Z', duration_min: null, notes: '', completed: 0, created_at: '2026-11-15T12:00:00.000Z', session_status: 'running', elapsed_seconds: 60, running_since_ms: 1794744000000, paused_since_ms: null, paused_seconds: 0, finished_at_ms: null };
    expect(await user.mutation(api.sync.apply, { kind: 'workouts', clientId: workout.id, payload: JSON.stringify(workout), expectedRevision: 0, operationId: op(22) })).toMatchObject({ status: 'applied' });
    const currentHabit = { ...habit, habit_type: 'boolean', target_value: 1, unit: '', increment: 1, reminder_enabled: 1, reminder_times: '["09:30"]', sort_order: 0 };
    expect(await user.mutation(api.sync.apply, { kind: 'habits', clientId: habit.id, payload: JSON.stringify(currentHabit), expectedRevision: 0, operationId: op(23) })).toMatchObject({ status: 'applied' });
    const food = { id: 'food-1', owner_id: profile.id, food_id: null, day: '2026-11-15', meal: 'lunch', name: 'Test food', grams: 100, kcal: 100, protein: 1, carbs: 20, fat: 1, kcal_100: 100, protein_100: 1, carbs_100: 20, fat_100: 1, created_at: '2026-11-15T12:00:00.000Z', catalog_food_id: 'fd_2dObzdqa6o2J' };
    expect(await user.mutation(api.sync.apply, { kind: 'food_entries', clientId: food.id, payload: JSON.stringify(food), expectedRevision: 0, operationId: op(24) })).toMatchObject({ status: 'applied' });
  });
  it('rejects unauthenticated operations and isolates owners', async () => {
    const t = convexTest(schema, modules);
    const args = { kind: 'profile' as const, clientId: profile.id, payload: JSON.stringify(profile), expectedRevision: 0, operationId: op(1) };
    await expect(t.mutation(api.sync.apply, args)).rejects.toThrow('Authentication required');
    await expect(t.query(api.sync.page, { paginationOpts: { numItems: 10, cursor: null } })).rejects.toThrow('Authentication required');
    const alice = t.withIdentity({ subject: 'user_A', issuer: 'https://clerk.example' });
    const bob = t.withIdentity({ subject: 'user_B', issuer: 'https://clerk.example' });
    await alice.mutation(api.eligibility.accept, adultAgreement(profile.birth_date));
    await bob.mutation(api.eligibility.accept, adultAgreement(profile.birth_date));
    await alice.mutation(api.sync.apply, args);
    expect((await bob.query(api.sync.page, { paginationOpts: { numItems: 10, cursor: null } })).page).toHaveLength(0);
    await expect(bob.mutation(api.sync.apply, { ...args, kind: 'habits', clientId: habit.id, payload: JSON.stringify(habit), operationId: op(2) })).rejects.toThrow('Parent record is not synchronized');
  });

  it('retries idempotently, detects stale edits and protects deletion conflicts', async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: 'user_A', issuer: 'https://clerk.example' });
    await user.mutation(api.eligibility.accept, adultAgreement(profile.birth_date));
    const args = { kind: 'profile' as const, clientId: profile.id, payload: JSON.stringify(profile), expectedRevision: 0, operationId: op(3) };
    expect(await user.mutation(api.sync.apply, args)).toEqual({ status: 'applied', revision: 1 });
    expect(await user.mutation(api.sync.apply, args)).toEqual({ status: 'applied', revision: 1 });
    await expect(user.mutation(api.sync.apply, { ...args, payload: JSON.stringify({ ...profile, name: 'Changed under same operation ID' }) })).rejects.toThrow('Operation ID reused');
    expect((await user.mutation(api.sync.apply, { ...args, payload: JSON.stringify({ ...profile, name: 'Other' }), operationId: op(4) })).status).toBe('conflict');
    expect(await user.mutation(api.sync.apply, { ...args, payload: null, expectedRevision: 1, operationId: op(5) })).toEqual({ status: 'applied', revision: 2 });
    expect((await user.mutation(api.sync.apply, { ...args, expectedRevision: 1, operationId: op(6) })).status).toBe('conflict');
  });

  it('deduplicates completion events by parent and day', async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: 'user_A', issuer: 'https://clerk.example' });
    await user.mutation(api.eligibility.accept, adultAgreement(profile.birth_date));
    await user.mutation(api.sync.apply, { kind: 'profile', clientId: profile.id, payload: JSON.stringify(profile), expectedRevision: 0, operationId: op(7) });
    await user.mutation(api.sync.apply, { kind: 'habits', clientId: habit.id, payload: JSON.stringify(habit), expectedRevision: 0, operationId: op(8) });
    const event = { id: 'device-a', habit_id: habit.id, day: '2026-11-05', created_at: '2026-11-05T00:00:00.000Z' };
    const id = `${habit.id}:${event.day}`;
    expect(await user.mutation(api.sync.apply, { kind: 'habit_completions', clientId: id, payload: JSON.stringify(event), expectedRevision: 0, operationId: op(9) })).toEqual({ status: 'applied', revision: 1 });
    expect(await user.mutation(api.sync.apply, { kind: 'habit_completions', clientId: id, payload: JSON.stringify({ ...event, id: 'device-b' }), expectedRevision: 0, operationId: op(10) })).toEqual({ status: 'applied', revision: 1 });
  });
  it('queues measured progress only with consent and protects its cloud owner', async () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys=ON');
    for (const migration of migrations) db.exec(migration);
    db.prepare('INSERT INTO profile VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(...Object.values(profile));
    db.prepare('INSERT INTO habits (id,owner_id,name,description,category,icon,frequency,days,weekly_target,start_date,archived,reminder_time,created_at,habit_type,target_value,unit,increment) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...Object.values(habit), 'quantity', 4, 'L', 0.5);
    const progress = { id: `${habit.id}:2026-11-05`, habit_id: habit.id, day: '2026-11-05', amount: 2, target_snapshot: 4, unit_snapshot: 'L', updated_at: '2026-11-05T12:00:00.000Z' };
    db.prepare('INSERT INTO habit_progress (id,habit_id,day,amount,target_snapshot,unit_snapshot,updated_at) VALUES (?,?,?,?,?,?,?)').run(...Object.values(progress));
    expect(db.prepare("SELECT count(*) AS n FROM sync_outbox WHERE kind='habit_progress'").get()?.n).toBe(0);
    db.exec("UPDATE sync_control SET choice='enabled' WHERE id=1");
    db.prepare('UPDATE habit_progress SET amount=3 WHERE id=?').run(progress.id);
    expect(db.prepare('SELECT action FROM sync_outbox WHERE kind=? AND record_id=?').get('habit_progress', progress.id)?.action).toBe('upsert');
    db.close();
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: 'user_A', issuer: 'https://clerk.example' });
    const bob = t.withIdentity({ subject: 'user_B', issuer: 'https://clerk.example' });
    await alice.mutation(api.eligibility.accept, adultAgreement(profile.birth_date));
    await bob.mutation(api.eligibility.accept, adultAgreement(profile.birth_date));
    await alice.mutation(api.sync.apply, { kind: 'profile', clientId: profile.id, payload: JSON.stringify(profile), expectedRevision: 0, operationId: op(11) });
    await alice.mutation(api.sync.apply, { kind: 'habits', clientId: habit.id, payload: JSON.stringify(habit), expectedRevision: 0, operationId: op(12) });
    await expect(bob.mutation(api.sync.apply, { kind: 'habit_progress', clientId: progress.id, payload: JSON.stringify(progress), expectedRevision: 0, operationId: op(13) })).rejects.toThrow('Parent record is not synchronized');
    expect(await alice.mutation(api.sync.apply, { kind: 'habit_progress', clientId: progress.id, payload: JSON.stringify(progress), expectedRevision: 0, operationId: op(14) })).toEqual({ status: 'applied', revision: 1 });
  });
});
