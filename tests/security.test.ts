/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../convex/schema';
import { api } from '../convex/_generated/api';
import { visibleCustomerInfo } from '../src/services/subscriptionLogic';

const modules = import.meta.glob('../convex/**/*.{ts,js}');
const date = '2026-11-04';
const createdAt = `${date}T12:00:00.000Z`;
const profile = { clientId: 'profile-1', name: 'Alice', birthDate: '1995-01-02', heightCm: 170, startWeight: 75, experience: 'Beginner', fitnessGoal: 'Health', growthGoals: '', language: 'en', completedAt: createdAt };
const habit = { clientId: 'habit-1', name: 'Walk', description: '', category: 'Fitness', icon: '✓', frequency: 'daily' as const, days: [], weeklyTarget: 3, startDate: date, archived: false, createdAt };
const weight = { clientId: 'weight-1', day: date, kg: 75, note: '', createdAt };
const setup = () => convexTest(schema, modules);

describe('public Convex function security', () => {
  it('rejects every private entry point without an identity', async () => {
    const t = setup();
    const calls = [
      () => t.query(api.identity.current, {}), () => t.query(api.profile.current, {}), () => t.mutation(api.profile.save, profile),
      () => t.query(api.habits.list, {}), () => t.mutation(api.habits.save, habit),
      () => t.mutation(api.habits.setCompletion, { habitClientId: habit.clientId, day: date, completed: true }),
      () => t.query(api.habits.completions, { habitClientId: habit.clientId }),
      () => t.query(api.weights.history, {}), () => t.mutation(api.weights.save, weight),
      () => t.mutation(api.weights.remove, { clientId: weight.clientId }),
      () => t.query(api.records.list, { table: 'workouts' }), () => t.query(api.records.get, { table: 'profiles', clientId: profile.clientId }),
    ];
    for (const call of calls) await expect(call()).rejects.toThrow('Authentication required');
    expect(await t.query(api.health.ping, {})).toEqual({ ok: true });
  });

  it('isolates profile, habits, completions and generic records across users', async () => {
    const t = setup();
    const a = t.withIdentity({ subject: 'user_A', issuer: 'https://clerk.example' });
    const b = t.withIdentity({ subject: 'user_B', issuer: 'https://clerk.example' });
    await a.mutation(api.profile.save, profile);
    await a.mutation(api.habits.save, habit);
    await a.mutation(api.habits.setCompletion, { habitClientId: habit.clientId, day: date, completed: true });
    expect(await b.query(api.profile.current, {})).toBeNull();
    expect(await b.query(api.habits.list, {})).toEqual([]);
    expect(await b.query(api.habits.completions, { habitClientId: habit.clientId })).toEqual([]);
    expect(await b.query(api.records.get, { table: 'profiles', clientId: profile.clientId })).toBeNull();
    expect(await b.query(api.records.list, { table: 'habitCompletions' })).toEqual([]);
    await expect(b.mutation(api.habits.setCompletion, { habitClientId: habit.clientId, day: date, completed: false })).rejects.toThrow('Habit not found');
    expect(await a.query(api.habits.completions, { habitClientId: habit.clientId })).toHaveLength(1);
  });

  it('rejects malformed and out-of-range writes without changing prior records', async () => {
    const t = setup();
    const a = t.withIdentity({ subject: 'user_A', issuer: 'https://clerk.example' });
    await expect(a.mutation(api.weights.save, { ...weight, kg: -1 })).rejects.toThrow('Invalid weight');
    await expect(a.mutation(api.weights.save, { ...weight, day: '2026-02-30' })).rejects.toThrow('Invalid date');
    await expect(a.mutation(api.weights.save, { ...weight, note: 'x'.repeat(2001) })).rejects.toThrow('Invalid note');
    await expect(a.mutation(api.profile.save, { ...profile, name: ' ' })).rejects.toThrow('Invalid name');
    await expect(a.mutation(api.profile.save, { ...profile, birthDate: '2999-01-01' })).rejects.toThrow('Invalid birth date');
    await expect(a.mutation(api.profile.save, { ...profile, experience: 'expert-plus' })).rejects.toThrow('Invalid experience');
    await expect(a.mutation(api.habits.save, { ...habit, weeklyTarget: 8 })).rejects.toThrow('Invalid weekly target');
    await expect(a.mutation(api.habits.save, { ...habit, days: [1, 1] })).rejects.toThrow('Invalid weekdays');
    await expect(a.mutation(api.habits.setCompletion, { habitClientId: habit.clientId, day: 'yesterday', completed: true })).rejects.toThrow('Invalid date');
    expect(await a.query(api.weights.history, {})).toEqual([]);
    expect(await a.query(api.habits.list, {})).toEqual([]);
  });

  it('blocks a second profile client ID for the same authenticated owner', async () => {
    const t = setup(); const a = t.withIdentity({ subject: 'user_A', issuer: 'https://clerk.example' });
    await a.mutation(api.profile.save, profile);
    await expect(a.mutation(api.profile.save, { ...profile, clientId: 'other' })).rejects.toThrow('Profile already exists');
    expect(await a.query(api.records.list, { table: 'profiles' })).toHaveLength(1);
  });
});

describe('account switch presentation', () => {
  it('suppresses old CustomerInfo immediately when Clerk changes or signs out', () => {
    const aliceInfo = { entitlements: { active: { premium: {} } } };
    expect(visibleCustomerInfo(aliceInfo, 'user_B', 'user_A')).toBeNull();
    expect(visibleCustomerInfo(aliceInfo, null, 'user_A')).toBeNull();
    expect(visibleCustomerInfo(aliceInfo, 'user_A', 'user_A')).toBe(aliceInfo);
  });
});
