/// <reference types="vite/client" />
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import { migrations } from '../src/data/schema';
import { orderOutbox, type OutboxRow } from '../src/data/syncOrder';
import { cloudUpsertSql } from '../src/data/syncSql';
import schema from '../convex/schema';
import { api } from '../convex/_generated/api';

const modules = import.meta.glob('../convex/**/*.{ts,js}');
const profile = { id: 'profile-1', name: 'A', birth_date: '1995-01-01', height_cm: 170, start_weight: 75, target_weight: null, experience: 'Beginner', fitness_goal: 'Health', growth_goals: '', language: 'en', completed_at: '2026-11-05T00:00:00.000Z' };
const habit = { id: 'habit-1', owner_id: 'profile-1', name: 'Walk', description: '', category: 'Fitness', icon: '✓', frequency: 'daily', days: '', weekly_target: 3, start_date: '2026-11-05', archived: 0, reminder_time: null, created_at: '2026-11-05T00:00:00.000Z' };
const op = (n: number) => n.toString(16).padStart(32, '0');

describe('durable SQLite queue', () => {
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
    db.prepare('INSERT INTO habits VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...Object.values(habit));
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
});

describe('authenticated cloud sync', () => {
  it('rejects unauthenticated operations and isolates owners', async () => {
    const t = convexTest(schema, modules);
    const args = { kind: 'profile' as const, clientId: profile.id, payload: JSON.stringify(profile), expectedRevision: 0, operationId: op(1) };
    await expect(t.mutation(api.sync.apply, args)).rejects.toThrow('Authentication required');
    await expect(t.query(api.sync.page, { paginationOpts: { numItems: 10, cursor: null } })).rejects.toThrow('Authentication required');
    const alice = t.withIdentity({ subject: 'user_A', issuer: 'https://clerk.example' });
    const bob = t.withIdentity({ subject: 'user_B', issuer: 'https://clerk.example' });
    await alice.mutation(api.sync.apply, args);
    expect((await bob.query(api.sync.page, { paginationOpts: { numItems: 10, cursor: null } })).page).toHaveLength(0);
    await expect(bob.mutation(api.sync.apply, { ...args, kind: 'habits', clientId: habit.id, payload: JSON.stringify(habit), operationId: op(2) })).rejects.toThrow('Parent record is not synchronized');
  });

  it('retries idempotently, detects stale edits and protects deletion conflicts', async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: 'user_A', issuer: 'https://clerk.example' });
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
    await user.mutation(api.sync.apply, { kind: 'profile', clientId: profile.id, payload: JSON.stringify(profile), expectedRevision: 0, operationId: op(7) });
    await user.mutation(api.sync.apply, { kind: 'habits', clientId: habit.id, payload: JSON.stringify(habit), expectedRevision: 0, operationId: op(8) });
    const event = { id: 'device-a', habit_id: habit.id, day: '2026-11-05', created_at: '2026-11-05T00:00:00.000Z' };
    const id = `${habit.id}:${event.day}`;
    expect(await user.mutation(api.sync.apply, { kind: 'habit_completions', clientId: id, payload: JSON.stringify(event), expectedRevision: 0, operationId: op(9) })).toEqual({ status: 'applied', revision: 1 });
    expect(await user.mutation(api.sync.apply, { kind: 'habit_completions', clientId: id, payload: JSON.stringify({ ...event, id: 'device-b' }), expectedRevision: 0, operationId: op(10) })).toEqual({ status: 'applied', revision: 1 });
  });
});
