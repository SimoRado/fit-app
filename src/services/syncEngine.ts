import type { CloudRow, OutboxRow, SyncKind } from '../data/syncOrder';
import { classifySyncFailure, orderedBehindFailure, retryDelayMs, type FailureCategory } from './syncFailures';

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
  markFailure: (op: OutboxRow, category: FailureCategory, detail: string, attempts: number, retryAt: number) => Promise<void>;
  recordSuccess: (account: string) => Promise<void>;
  applyCloud: (rows: CloudRow[], account: string) => Promise<{ applied: number; conflicts: number }>;
};

export async function runSyncCycle(account: string, isCurrent: () => boolean, transport: SyncTransport, store: SyncStore) {
  const check = () => { if (!isCurrent()) throw Error('Account changed during synchronization'); };
  check();
  const failed: OutboxRow[] = [];
  for (const op of await store.pendingOperations()) {
    check();
    if (op.conflict || op.failure_category === 'validation' || op.failure_category === 'auth' || (op.next_retry_at ?? 0) > Date.now() || failed.some(previous => orderedBehindFailure(op, previous))) {
      failed.push(op);
      continue;
    }
    const payload = await store.localPayload(op);
    const expectedRevision = await store.localRevision(op.kind, op.record_id);
    check();
    let result: Result;
    try {
      result = await transport.apply({ kind: op.kind, clientId: op.record_id, payload, expectedRevision, operationId: op.operation_id });
    } catch (cause) {
      check();
      const category = classifySyncFailure(cause);
      const attempts = (op.attempts ?? 0) + 1;
      const detail = category === 'validation' ? 'The server rejected this record. Review it or retry after a backend update.'
        : category === 'dependency' ? 'A required parent record has not synchronized.'
        : category === 'auth' ? 'Cloud authentication is unavailable.'
        : 'Cloud service temporarily unavailable.';
      await store.markFailure(op, category, detail, attempts, category === 'validation' || category === 'auth' ? 0 : Date.now() + retryDelayMs(attempts));
      failed.push(op);
      if (category === 'network' || category === 'auth' || category === 'temporary') break;
      continue;
    }
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
  await store.recordSuccess(account);
  return outcome;
}
