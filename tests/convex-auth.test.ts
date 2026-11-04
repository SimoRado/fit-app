/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../convex/schema';
import { api } from '../convex/_generated/api';

const modules = import.meta.glob('../convex/**/*.{ts,js}');
const weight = { clientId: 'entry-1', day: '2026-11-04', kg: 80, note: '', createdAt: '2026-11-04T00:00:00.000Z' };

describe('Convex ownership', () => {
  it('rejects private reads and writes without a verified identity', async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.profile.current, {})).rejects.toThrow('Authentication required');
    await expect(t.query(api.identity.current, {})).rejects.toThrow('Authentication required');
    await expect(t.mutation(api.weights.save, weight)).rejects.toThrow('Authentication required');
  });

  it('isolates records by verified identity even when client IDs match', async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: 'user_A', issuer: 'https://clerk.example' });
    const bob = t.withIdentity({ subject: 'user_B', issuer: 'https://clerk.example' });
    await alice.mutation(api.weights.save, weight);
    expect((await alice.query(api.weights.history, {}))).toHaveLength(1);
    expect(await bob.query(api.weights.history, {})).toEqual([]);
    await bob.mutation(api.weights.remove, { clientId: weight.clientId });
    expect((await alice.query(api.weights.history, {}))).toHaveLength(1);
    await bob.mutation(api.weights.save, { ...weight, kg: 75 });
    expect((await alice.query(api.weights.history, {}))[0].kg).toBe(80);
    expect((await bob.query(api.weights.history, {}))[0].kg).toBe(75);
    expect((await alice.query(api.identity.current, {})).subject).toBe('user_A');
  });
});
