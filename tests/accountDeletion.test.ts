/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../convex/schema';
import { api, internal } from '../convex/_generated/api';
import { deleteClerkUser, deleteRevenueCatCustomer, recentFactor } from '../convex/accountDeletionActions';

const modules = import.meta.glob('../convex/**/*.{ts,js}');
const entry = { clientId: 'weight-1', day: '2026-11-04', kg: 80, note: '', createdAt: '2026-11-04T00:00:00.000Z' };
const receipt = 'a'.repeat(72);
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('account deletion authorization and cleanup', () => {
  it('rejects missing explicit confirmation before creating a job', async () => {
    const t = convexTest(schema, modules);
    await expect(t.action(api.accountDeletionActions.request, { confirmation: 'NO', sessionToken: '', receipt })).rejects.toThrow('Deletion confirmation required');
    expect(await t.run(async ctx => ctx.db.query('deletionJobs').collect())).toEqual([]);
  });
  it('blocks stale clients immediately, deletes only the target owner, and deduplicates requests', async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: 'user_A', issuer: 'https://clerk.example' });
    const bob = t.withIdentity({ subject: 'user_B', issuer: 'https://clerk.example' });
    await alice.mutation(api.weights.save, entry);
    await bob.mutation(api.weights.save, entry);
    const owner = await t.run(async ctx => (await ctx.db.query('weights').first())!.owner);
    await t.run(async ctx => {
      await ctx.db.insert('syncRecords', { owner, kind: 'weights', clientId: entry.clientId, payload: JSON.stringify(entry), revision: 1, deleted: false, updatedAt: Date.now() });
      await ctx.db.insert('syncOperations', { owner, operationId: 'f'.repeat(32), kind: 'weights', clientId: entry.clientId, revision: 1 });
    });
    const started = await t.mutation(internal.accountDeletion.begin, { owner, clerkUserId: 'user_A', receipt });
    const repeated = await t.mutation(internal.accountDeletion.begin, { owner, clerkUserId: 'user_A', receipt: 'b'.repeat(72) });
    expect(repeated).toEqual(started);
    await expect(t.mutation(internal.accountDeletion.begin, { owner, clerkUserId: 'user_B', receipt })).rejects.toThrow('Deletion target mismatch');
    await expect(alice.query(api.weights.history, {})).rejects.toThrow('Account deletion in progress');
    await expect(alice.mutation(api.weights.save, { ...entry, kg: 90 })).rejects.toThrow('Account deletion in progress');
    await expect(alice.mutation(api.sync.apply, { kind: 'weights', clientId: entry.clientId, payload: JSON.stringify(entry), expectedRevision: 1, operationId: 'e'.repeat(32) })).rejects.toThrow('Account deletion in progress');
    expect(await bob.query(api.weights.history, {})).toHaveLength(1);
    const jobId = await t.run(async ctx => (await ctx.db.query('deletionJobs').withIndex('by_owner', q => q.eq('owner', owner)).first())!._id);
    while (await t.mutation(internal.accountDeletion.cleanBatch, { jobId })) { /* bounded batches */ }
    expect(await t.run(async ctx => ctx.db.query('weights').withIndex('by_owner', q => q.eq('owner', owner)).collect())).toEqual([]);
    expect(await t.run(async ctx => ctx.db.query('syncRecords').withIndex('by_owner', q => q.eq('owner', owner)).collect())).toEqual([]);
    expect(await t.run(async ctx => ctx.db.query('syncOperations').withIndex('by_owner', q => q.eq('owner', owner)).collect())).toEqual([]);
    expect(await bob.query(api.weights.history, {})).toHaveLength(1);
    expect((await t.query(api.accountDeletion.status, { receipt }))?.stage).toBe('revenuecat_pending');
    expect(await t.query(api.accountDeletion.status, { receipt: 'x'.repeat(72) })).toBeNull();
    await t.mutation(internal.accountDeletion.fail, { jobId, retryStage: 'revenuecat_pending', errorCategory: 'revenuecat_rate_limit' });
    expect((await t.query(api.accountDeletion.status, { receipt }))?.stage).toBe('retry_required');
    await t.mutation(internal.accountDeletion.resume, { jobId });
    expect((await t.query(api.accountDeletion.status, { receipt }))?.stage).toBe('revenuecat_pending');
    await t.mutation(internal.accountDeletion.advance, { jobId, from: 'revenuecat_pending', to: 'clerk_pending' });
    await t.mutation(internal.accountDeletion.complete, { jobId });
    expect((await t.query(api.accountDeletion.status, { receipt }))?.stage).toBe('completed');
  });
  it('requires fresh factor evidence', () => {
    expect(recentFactor([0, -1])).toBe(true);
    expect(recentFactor([10, -1])).toBe(false);
    expect(recentFactor([99, 0])).toBe(true);
    expect(recentFactor('0')).toBe(false);
  });
});

describe('external deletion services with mocked APIs', () => {
  it('deletes a matching RevenueCat customer and confirms the asynchronous removal', async () => {
    vi.stubEnv('REVENUECAT_SECRET_KEY', 'test-secret'); vi.stubEnv('REVENUECAT_PROJECT_ID', 'proj_test');
    const responses = [
      { status: 200, body: { items: [{ id: 'customer_1' }], next_page: null } },
      { status: 200, body: { items: [{ id: 'user_A' }, { id: '$RCAnonymousID:abc' }], next_page: null } },
      { status: 200, body: {} }, { status: 404, body: {} },
    ];
    const fetcher = vi.fn(async (_url: string, _options?: RequestInit) => { const item = responses.shift()!; return { ok: item.status >= 200 && item.status < 300, status: item.status, json: async () => item.body }; });
    vi.stubGlobal('fetch', fetcher);
    await deleteRevenueCatCustomer('user_A');
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher.mock.calls[2][0]).toContain('/customers/customer_1');
    expect(fetcher.mock.calls[2][1]).toMatchObject({ method: 'DELETE' });
  });
  it('refuses a shared aliased customer and retries pending or rate-limited deletions', async () => {
    vi.stubEnv('REVENUECAT_SECRET_KEY', 'test-secret'); vi.stubEnv('REVENUECAT_PROJECT_ID', 'proj_test');
    const responses = [{ status: 200, body: { items: [{ id: 'customer_1' }] } }, { status: 200, body: { items: [{ id: 'user_A' }, { id: 'user_B' }] } }];
    vi.stubGlobal('fetch', vi.fn(async () => { const item = responses.shift()!; return { ok: true, status: item.status, json: async () => item.body }; }));
    await expect(deleteRevenueCatCustomer('user_A')).rejects.toThrow('revenuecat_shared_customer');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429 })));
    await expect(deleteRevenueCatCustomer('user_A')).rejects.toThrow('revenuecat_rate_limit');
  });
  it('accepts a missing RevenueCat customer and keeps a queued deletion pending', async () => {
    vi.stubEnv('REVENUECAT_SECRET_KEY', 'test-secret'); vi.stubEnv('REVENUECAT_PROJECT_ID', 'proj_test');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ items: [] }) })));
    await expect(deleteRevenueCatCustomer('user_A')).resolves.toBeUndefined();
    const responses = [
      { ok: true, status: 200, body: { items: [{ id: 'customer_1' }] } },
      { ok: true, status: 200, body: { items: [{ id: 'user_A' }] } },
      { ok: true, status: 200, body: {} },
      { ok: true, status: 200, body: {} },
    ];
    vi.stubGlobal('fetch', vi.fn(async () => { const item = responses.shift()!; return { ok: item.ok, status: item.status, json: async () => item.body }; }));
    await expect(deleteRevenueCatCustomer('user_A')).rejects.toThrow('revenuecat_deletion_pending');
  });
  it('treats an already deleted Clerk user as complete without exposing the secret', async () => {
    vi.stubEnv('CLERK_SECRET_KEY', 'test-secret');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    await expect(deleteClerkUser('user_A')).resolves.toBeUndefined();
  });
});
