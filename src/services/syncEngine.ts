import type { CloudRow, OutboxRow, SyncKind } from '../data/syncOrder';

type Result = { status: 'applied' | 'conflict'; revision: number };
type Page = { page: CloudRow[]; isDone: boolean; continueCursor: string };
export type SyncTransport = {
  apply: (args: { kind: SyncKind; clientId: string; payload: string | null; expectedRevision: number; operationId: string }) => Promise<Result>;
  page: (cursor: string | null) => Promise<Page>;
};
export type SyncStore = {
  pendingOperations: () => Promise<OutboxRow[]>;
  localPayload: (op: OutboxRow) => Promise<string | null>;
  localRevision: (kind: SyncKind, id: string) => Promise<number>;
  acknowledge: (op: OutboxRow, revision: number) => Promise<void>;
  markConflict: (op: OutboxRow) => Promise<void>;
  applyCloud: (rows: CloudRow[], account: string) => Promise<{ applied: number; conflicts: number }>;
};

export async function runSyncCycle(account: string, isCurrent: () => boolean, transport: SyncTransport, store: SyncStore) {
  const check = () => { if (!isCurrent()) throw Error('Account changed during synchronization'); };
  check();
  for (const op of await store.pendingOperations()) {
    check();
    if (op.conflict) continue;
    const payload = await store.localPayload(op);
    const expectedRevision = await store.localRevision(op.kind, op.record_id);
    check();
    const result = await transport.apply({ kind: op.kind, clientId: op.record_id, payload, expectedRevision, operationId: op.operation_id });
    check();
    if (result.status === 'conflict') await store.markConflict(op);
    else await store.acknowledge(op, result.revision);
  }
  const cloud: CloudRow[] = [];
  let cursor: string | null = null;
  do {
    check();
    const response: Page = await transport.page(cursor);
    check();
    cloud.push(...response.page);
    cursor = response.isDone ? null : response.continueCursor;
  } while (cursor !== null);
  check();
  const outcome = await store.applyCloud(cloud, account);
  check();
  return outcome;
}
