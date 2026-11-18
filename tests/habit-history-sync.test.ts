/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../convex/schema';
import { api } from '../convex/_generated/api';
import { historySnapshotWins } from '../convex/syncContract';
import { HABIT_HISTORY_CLOUD_BACKUP, heldSyncKinds, syncTables } from '../src/data/syncSchema';
import { upsertOrder } from '../src/data/syncOrder';
import { adultAgreement } from './eligibilityFixture';

const modules = import.meta.glob('../convex/**/*.{ts,js}');
const op = (n: number) => n.toString(16).padStart(32, '0');
const profile = { id: 'profile-1', name: 'A', birth_date: '1995-01-01', height_cm: 170, start_weight: 75, target_weight: null, experience: 'Beginner', fitness_goal: 'Health', growth_goals: '', language: 'en', completed_at: '2026-11-05T00:00:00.000Z' };
const items = [{ h: 'a', n: 'Water', i: 'water', c: 'Nutrition', t: 'q', d: 0, g: 3, a: 2, u: 'L' }, { h: 'b', n: 'Read', i: 'book', c: 'Mind', t: 'b', d: 1 }];
const day = (patch: Record<string, unknown> = {}) => ({ id: 'profile-1:2026-11-09', owner_id: 'profile-1', day: '2026-11-09', status: 'final', source: 'tracked', eligible: 2, completed: 1, percent: 50, items: JSON.stringify(items), updated_at: '2026-11-10T08:00:00.000Z', ...patch });

async function user() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: 'user_A', issuer: 'https://clerk.example' });
  await alice.mutation(api.eligibility.accept, adultAgreement(profile.birth_date));
  await alice.mutation(api.sync.apply, { kind: 'profile', clientId: profile.id, payload: JSON.stringify(profile), expectedRevision: 0, operationId: op(1) });
  return { t, alice };
}
const push = (client: Awaited<ReturnType<typeof user>>['alice'], payload: Record<string, unknown>, expectedRevision: number, n: number) =>
  client.mutation(api.sync.apply, { kind: 'habit_days', clientId: String(payload.id), payload: JSON.stringify(payload), expectedRevision, operationId: op(n) });

describe('habit_days cloud contract (source; deploy pending approval)', () => {
  it('accepts a consistent day snapshot under the owner profile', async () => {
    const { alice } = await user();
    expect(await push(alice, day(), 0, 2)).toEqual({ status: 'applied', revision: 1 });
  });

  it('rejects snapshots whose counts do not match their own items, or that belong to another id', async () => {
    const { alice } = await user();
    await expect(push(alice, day({ completed: 2, percent: 100 }), 0, 3)).rejects.toThrow('Invalid habit history');
    await expect(push(alice, day({ percent: 60 }), 0, 4)).rejects.toThrow('Invalid habit history');
    await expect(push(alice, day({ id: 'profile-1:2026-11-10' }), 0, 5)).rejects.toThrow();
    await expect(push(alice, day({ status: 'maybe' }), 0, 6)).rejects.toThrow('Invalid habit history');
  });

  it('requires the profile to be synchronized first and isolates accounts', async () => {
    const t = convexTest(schema, modules);
    const bob = t.withIdentity({ subject: 'user_B', issuer: 'https://clerk.example' });
    await bob.mutation(api.eligibility.accept, adultAgreement(profile.birth_date));
    await expect(push(bob, day(), 0, 7)).rejects.toThrow('Parent record is not synchronized');
  });

  it('converges two devices: final beats open, then the newest snapshot wins', async () => {
    const { alice } = await user();
    await push(alice, day({ status: 'open', completed: 0, percent: 0, items: JSON.stringify(items.map(item => ({ ...item, d: 0 }))), updated_at: '2026-11-09T20:00:00.000Z' }), 0, 8);
    // Second device never saw revision 1 but has the finalized day: it wins without a stuck conflict.
    expect(await push(alice, day(), 0, 9)).toEqual({ status: 'applied', revision: 2 });
    // A stale open snapshot from a third device loses.
    expect(await push(alice, day({ status: 'open', updated_at: '2026-11-11T00:00:00.000Z' }), 0, 10)).toEqual({ status: 'conflict', revision: 2 });
    expect(historySnapshotWins({ status: 'final', updated_at: 'a' }, { status: 'open', updated_at: 'z' })).toBe(true);
    expect(historySnapshotWins({ status: 'final', updated_at: '2026-11-12' }, { status: 'final', updated_at: '2026-11-11' })).toBe(true);
    expect(historySnapshotWins({ status: 'final', updated_at: '2026-11-10' }, { status: 'final', updated_at: '2026-11-11' })).toBe(false);
  });

  it('is registered locally, ordered after its parent and held back until the backend is deployed', () => {
    expect(syncTables.some(table => table.name === 'habit_days')).toBe(true);
    expect(upsertOrder.indexOf('habit_days')).toBeGreaterThan(upsertOrder.indexOf('profile'));
    expect(heldSyncKinds.has('habit_days')).toBe(!HABIT_HISTORY_CLOUD_BACKUP);
  });
});
