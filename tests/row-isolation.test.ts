/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../convex/schema';
import { api } from '../convex/_generated/api';
import { adultAgreement } from './eligibilityFixture';
import { localDatabaseName } from '../src/data/account';

const modules = import.meta.glob('../convex/**/*.{ts,js}');
const timestamp = '2026-11-21T12:00:00.000Z';
const profile = {
  id: 'profile-a', name: 'Alice', birth_date: '1990-01-01', height_cm: 170,
  start_weight: 70, target_weight: null, experience: 'Beginner', fitness_goal: 'Health',
  growth_goals: '', language: 'en', completed_at: timestamp,
};
const habit = {
  id: 'habit-a', owner_id: profile.id, name: 'Walk', description: '', category: 'Fitness',
  icon: '✓', frequency: 'daily', days: '', weekly_target: 1, start_date: '2026-11-21',
  archived: 0, reminder_time: null, created_at: timestamp, habit_type: 'boolean', target_value: 1,
  unit: '', increment: 1, reminder_enabled: 0, reminder_times: '[]', sort_order: 0,
};
const workout = {
  id: 'workout-a', owner_id: profile.id, name: 'Session', day: '2026-11-21', started_at: timestamp,
  duration_min: null, notes: '', completed: 0, created_at: timestamp, session_status: 'draft',
  elapsed_seconds: 0, running_since_ms: null, paused_since_ms: null, paused_seconds: 0, finished_at_ms: null,
};
const operation = (digit: string) => digit.repeat(32);

describe('row-level-equivalent Convex isolation', () => {
  it('rejects unauthenticated sync reads and writes', async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.sync.page, { paginationOpts: { numItems: 10, cursor: null } })).rejects.toThrow('Authentication required');
    await expect(t.mutation(api.sync.apply, { kind: 'profile', clientId: profile.id, payload: JSON.stringify(profile), expectedRevision: 0, operationId: operation('0') })).rejects.toThrow('Authentication required');
  });

  it('prevents a second identity from reading, deleting, or attaching nested records to another account backup', async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: 'user_A', issuer: 'https://clerk.example' });
    const bob = t.withIdentity({ subject: 'user_B', issuer: 'https://clerk.example' });
    await alice.mutation(api.eligibility.accept, adultAgreement(profile.birth_date));
    await bob.mutation(api.eligibility.accept, adultAgreement(profile.birth_date));

    await alice.mutation(api.sync.apply, { kind: 'profile', clientId: profile.id, payload: JSON.stringify(profile), expectedRevision: 0, operationId: operation('1') });
    await alice.mutation(api.sync.apply, { kind: 'habits', clientId: habit.id, payload: JSON.stringify(habit), expectedRevision: 0, operationId: operation('2') });
    await alice.mutation(api.sync.apply, { kind: 'workouts', clientId: workout.id, payload: JSON.stringify(workout), expectedRevision: 0, operationId: operation('3') });

    expect((await bob.query(api.sync.page, { paginationOpts: { numItems: 100, cursor: null } })).page).toEqual([]);
    const crossAccountExercise = { id: 'link-b', workout_id: workout.id, exercise_id: 'bench', position: 0 };
    await expect(bob.mutation(api.sync.apply, {
      kind: 'workout_exercises', clientId: crossAccountExercise.id, payload: JSON.stringify(crossAccountExercise), expectedRevision: 0, operationId: operation('4'),
    })).rejects.toThrow('Parent record is not synchronized');

    expect(await bob.mutation(api.sync.apply, {
      kind: 'profile', clientId: profile.id, payload: null, expectedRevision: 1, operationId: operation('5'),
    })).toEqual({ status: 'conflict', revision: 0 });

    const aliceRows = (await alice.query(api.sync.page, { paginationOpts: { numItems: 100, cursor: null } })).page;
    expect(aliceRows.map(row => row.clientId).sort()).toEqual([profile.id, habit.id, workout.id].sort());
    expect(await bob.query(api.sync.page, { paginationOpts: { numItems: 100, cursor: null } })).toMatchObject({ page: [] });
  });

  it('keeps guest and account database names separate across an account switch', () => {
    const aliceDatabase = localDatabaseName('user_A123');
    const bobDatabase = localDatabaseName('user_B456');
    expect(aliceDatabase).toBe('better-day-user_A123.db');
    expect(bobDatabase).toBe('better-day-user_B456.db');
    expect(new Set(['better-day.db', aliceDatabase, bobDatabase]).size).toBe(3);
  });
});
