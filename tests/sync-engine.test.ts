import { describe, expect, it, vi } from 'vitest';
import { runSyncCycle, type SyncStore, type SyncTransport } from '../src/services/syncEngine';
import type { OutboxRow } from '../src/data/syncOrder';
import { retryDelayMs } from '../src/services/syncFailures';

const op: OutboxRow = { kind: 'habits', record_id: 'habit-1', action: 'upsert', operation_id: 'a'.repeat(32), conflict: 0 };
function fixture() {
  let queued = true;
  const store: SyncStore = {
    pendingOperations: async () => queued ? [op] : [],
    localPayload: async () => '{"id":"habit-1"}', localRevision: async () => 0,
    acknowledge: vi.fn(async () => { queued = false; }), markConflict: vi.fn(async () => {}),
    markFailure: vi.fn(async () => {}), recordSuccess: vi.fn(async () => {}),
    applyCloud: vi.fn(async () => ({ applied: 1, conflicts: 0 })),
  };
  const transport: SyncTransport = {
    apply: vi.fn(async () => ({ status: 'applied' as const, revision: 1 })),
    page: vi.fn(async () => ({ page: [{ kind: 'habits', clientId: op.record_id, payload: '{"id":"habit-1"}', revision: 1, deleted: false }], isDone: true, continueCursor: '' })),
  };
  return { store, transport };
}

describe('sync cycle', () => {
  it('bounds temporary retry delays', () => {
    expect([1, 2, 3, 10].map(retryDelayMs)).toEqual([5000, 10000, 20000, 300000]);
  });
  it('uploads a queued change, acknowledges it, then restores cloud changes', async () => {
    const { store, transport } = fixture();
    expect(await runSyncCycle('user_A', () => true, transport, store)).toEqual({ applied: 1, conflicts: 0 });
    expect(transport.apply).toHaveBeenCalledWith({ kind: op.kind, clientId: op.record_id, payload: '{"id":"habit-1"}', expectedRevision: 0, operationId: op.operation_id });
    expect(store.acknowledge).toHaveBeenCalledWith(op, 1);
    expect(store.applyCloud).toHaveBeenCalledWith(expect.any(Array), 'user_A');
    expect(store.recordSuccess).toHaveBeenCalledWith('user_A');
  });
  it('preserves the operation after a network failure and retries with the same ID', async () => {
    const { store, transport } = fixture();
    const realApply = transport.apply;
    let fail = true;
    transport.apply = async args => { if (fail) { fail = false; throw Error('Network offline'); } return realApply(args); };
    await runSyncCycle('user_A', () => true, transport, store);
    expect(store.acknowledge).not.toHaveBeenCalled();
    expect(store.markFailure).toHaveBeenCalledWith(op, 'network', expect.any(String), 1, expect.any(Number));
    await runSyncCycle('user_A', () => true, transport, store);
    expect(store.acknowledge).toHaveBeenCalledWith(op, 1);
  });
  it('does not acknowledge or download after the Clerk account changes mid-upload', async () => {
    const { store, transport } = fixture();
    let current = true;
    transport.apply = async () => { current = false; return { status: 'applied', revision: 1 }; };
    await expect(runSyncCycle('user_A', () => current, transport, store)).rejects.toThrow('Account changed');
    expect(store.acknowledge).not.toHaveBeenCalled();
    expect(transport.page).not.toHaveBeenCalled();
    expect(store.applyCloud).not.toHaveBeenCalled();
  });
  it('marks revision conflicts without deleting the pending operation', async () => {
    const { store, transport } = fixture();
    transport.apply = async () => ({ status: 'conflict', revision: 2 });
    await runSyncCycle('user_A', () => true, transport, store);
    expect(store.markConflict).toHaveBeenCalledWith(op);
    expect(store.acknowledge).not.toHaveBeenCalled();
  });
  it('preserves an invalid operation while allowing an independent record to upload', async () => {
    const { store, transport } = fixture();
    const weight: OutboxRow = { ...op, kind: 'weights', record_id: 'weight-1', operation_id: 'b'.repeat(32) };
    store.pendingOperations = async () => [op, weight];
    transport.apply = vi.fn(async args => {
      if (args.kind === 'habits') throw Error('Uncaught Error: Invalid record fields');
      return { status: 'applied' as const, revision: 1 };
    });
    await runSyncCycle('user_A', () => true, transport, store);
    expect(store.markFailure).toHaveBeenCalledWith(op, 'validation', expect.any(String), 1, 0);
    expect(store.acknowledge).toHaveBeenCalledWith(weight, 1);
    expect(store.acknowledge).not.toHaveBeenCalledWith(op, expect.anything());
  });
  it('does not upload a child behind a failed parent', async () => {
    const { store, transport } = fixture();
    const child: OutboxRow = { ...op, kind: 'habit_completions', record_id: 'habit-1:2026-11-15', operation_id: 'c'.repeat(32) };
    store.pendingOperations = async () => [op, child];
    transport.apply = vi.fn(async () => { throw Error('Invalid record fields'); });
    await runSyncCycle('user_A', () => true, transport, store);
    expect(transport.apply).toHaveBeenCalledTimes(1);
    expect(store.acknowledge).not.toHaveBeenCalled();
  });
});
