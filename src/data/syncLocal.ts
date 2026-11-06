import * as SQLite from 'expo-sqlite';
import { db, getLocalAccount } from './db';
import { syncTables } from './syncSchema';
import { orderOutbox, upsertOrder, type CloudRow, type OutboxRow, type SyncKind } from './syncOrder';
import { cloudUpsertSql } from './syncSql';

export type SyncChoice = 'ask' | 'local' | 'enabled';
export type { SyncKind, OutboxRow, CloudRow } from './syncOrder';
const descriptors = Object.fromEntries(syncTables.map(t => [t.name, t])) as Record<SyncKind, typeof syncTables[number]>;
const primary: Partial<Record<SyncKind, string>> = { rest_days: 'owner_id,day', favorites: 'owner_id,card_id', preferences: 'key', nutrition_preferences: 'owner_id' };

export async function syncChoice(): Promise<SyncChoice> {
  const row = await (await db()).getFirstAsync<{ choice: SyncChoice }>('SELECT choice FROM sync_control WHERE id=1');
  return row?.choice ?? 'ask';
}

export async function localSyncStatus() {
  const d = await db();
  const [choice, pending, conflicts] = await Promise.all([
    syncChoice(),
    d.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM sync_outbox WHERE conflict=0'),
    d.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM sync_outbox WHERE conflict=1'),
  ]);
  return { choice, pending: pending?.n ?? 0, conflicts: conflicts?.n ?? 0 };
}

export async function chooseSync(choice: 'local' | 'enabled') {
  const d = await db();
  await d.withExclusiveTransactionAsync(async tx => {
    if (choice === 'enabled') {
      for (const table of syncTables) {
        const key = table.key.replaceAll('NEW.', '');
        const condition = 'whenNew' in table ? `WHERE ${table.whenNew.replaceAll('NEW.', '')}` : '';
        await tx.execAsync(`INSERT OR IGNORE INTO sync_outbox(kind,record_id,action,operation_id) SELECT '${table.name}',${key},'upsert',lower(hex(randomblob(16))) FROM ${table.name} ${condition};`);
      }
    }
    await tx.runAsync('UPDATE sync_control SET choice=? WHERE id=1', choice);
  });
}

export async function pendingOperations() {
  const rows = await (await db()).getAllAsync<OutboxRow>('SELECT * FROM sync_outbox');
  return orderOutbox(rows);
}

function keyWhere(kind: SyncKind, id: string): { sql: string; args: string[] } {
  if (kind === 'preferences') return { sql: 'key=?', args: [id] };
  if (kind === 'nutrition_preferences') return { sql: 'owner_id=?', args: [id] };
  if (kind === 'habit_completions' || kind === 'mission_completions') {
    const split = id.lastIndexOf(':');
    return { sql: `${kind === 'habit_completions' ? 'habit_id' : 'mission_id'}=? AND day=?`, args: [id.slice(0, split), id.slice(split + 1)] };
  }
  if (kind === 'rest_days' || kind === 'favorites') {
    const split = id.indexOf(':');
    return { sql: `owner_id=? AND ${kind === 'rest_days' ? 'day' : 'card_id'}=?`, args: [id.slice(0, split), id.slice(split + 1)] };
  }
  return { sql: 'id=?', args: [id] };
}

export async function localPayload(op: OutboxRow): Promise<string | null> {
  if (op.action === 'delete') return null;
  const { sql, args } = keyWhere(op.kind, op.record_id);
  const row = await (await db()).getFirstAsync<Record<string, string | number | null>>(`SELECT * FROM ${op.kind} WHERE ${sql}`, ...args);
  return row ? JSON.stringify(row) : null;
}

export async function localRevision(kind: SyncKind, id: string) {
  const row = await (await db()).getFirstAsync<{ revision: number }>('SELECT revision FROM sync_versions WHERE kind=? AND record_id=?', kind, id);
  return row?.revision ?? 0;
}

export async function acknowledge(op: OutboxRow, revision: number) {
  const d = await db();
  await d.withExclusiveTransactionAsync(async tx => {
    await tx.runAsync('INSERT INTO sync_versions(kind,record_id,revision) VALUES (?,?,?) ON CONFLICT(kind,record_id) DO UPDATE SET revision=max(revision,excluded.revision)', op.kind, op.record_id, revision);
    await tx.runAsync('DELETE FROM sync_outbox WHERE kind=? AND record_id=? AND operation_id=?', op.kind, op.record_id, op.operation_id);
  });
}

export async function markConflict(op: OutboxRow) {
  await (await db()).runAsync('UPDATE sync_outbox SET conflict=1 WHERE kind=? AND record_id=? AND operation_id=?', op.kind, op.record_id, op.operation_id);
}

function cloudOrder(a: CloudRow, b: CloudRow) {
  const index = (row: CloudRow) => upsertOrder.indexOf(row.kind as SyncKind);
  return (a.deleted ? 1 : 0) - (b.deleted ? 1 : 0) || (a.deleted ? -1 : 1) * (index(a) - index(b));
}

export async function applyCloud(rows: CloudRow[], account: string) {
  if (getLocalAccount() !== account) throw Error('Account changed during restore');
  const d = await db();
  let applied = 0, conflicts = 0;
  await d.withExclusiveTransactionAsync(async tx => {
    const control = await tx.getFirstAsync<{ choice: string }>('SELECT choice FROM sync_control WHERE id=1');
    if (control?.choice !== 'enabled' || getLocalAccount() !== account) throw Error('Cloud sync is not enabled for this account');
    await tx.runAsync("UPDATE sync_control SET choice='applying' WHERE id=1");
    for (const cloud of [...rows].sort(cloudOrder)) {
      if (!(cloud.kind in descriptors) || !Number.isSafeInteger(cloud.revision) || cloud.revision < 0) throw Error('Invalid cloud record');
      const kind = cloud.kind as SyncKind;
      const version = await tx.getFirstAsync<{ revision: number }>('SELECT revision FROM sync_versions WHERE kind=? AND record_id=?', kind, cloud.clientId);
      if ((version?.revision ?? 0) >= cloud.revision) continue;
      const pending = await tx.getFirstAsync('SELECT 1 FROM sync_outbox WHERE kind=? AND record_id=?', kind, cloud.clientId);
      if (pending) { conflicts++; continue; }
      if (cloud.deleted && await tx.getFirstAsync('SELECT 1 FROM sync_outbox LIMIT 1')) { conflicts++; continue; }
      const { sql, args } = keyWhere(kind, cloud.clientId);
      const existing = await tx.getFirstAsync(`SELECT 1 FROM ${kind} WHERE ${sql}`, ...args);
      if (existing && !version) { conflicts++; continue; }
      if (cloud.deleted) await tx.runAsync(`DELETE FROM ${kind} WHERE ${sql}`, ...args);
      else {
        if (!cloud.payload) throw Error('Missing cloud payload');
        const row = JSON.parse(cloud.payload) as Record<string, string | number | null>;
        const columns = Object.keys(row);
        if (!columns.length || columns.some(column => !/^[a-z_]+$/.test(column))) throw Error('Invalid cloud payload');
        const pk = primary[kind] ?? 'id';
        await tx.runAsync(cloudUpsertSql(kind, columns, pk), ...Object.values(row));
      }
      await tx.runAsync('INSERT INTO sync_versions(kind,record_id,revision) VALUES (?,?,?) ON CONFLICT(kind,record_id) DO UPDATE SET revision=excluded.revision', kind, cloud.clientId, cloud.revision);
      applied++;
    }
    if (getLocalAccount() !== account) throw Error('Account changed during restore');
    await tx.runAsync("UPDATE sync_control SET choice='enabled' WHERE id=1");
  });
  return { applied, conflicts };
}

export async function localRecordCount() {
  const d = await db();
  const counts = await Promise.all(syncTables.filter(t => t.name !== 'exercises').map(t => d.getFirstAsync<{ n: number }>(`SELECT count(*) AS n FROM ${t.name}`)));
  return counts.reduce((total, row) => total + (row?.n ?? 0), 0);
}

export async function ensureNoPendingBeforeLocalDelete() {
  const status = await localSyncStatus();
  if (status.pending || status.conflicts) throw Error('Resolve or back up pending changes before deleting local data.');
  await chooseSync('local');
}

export async function adoptGuestData() {
  const target = await db();
  if (await target.getFirstAsync('SELECT id FROM profile LIMIT 1')) throw Error('This account already has a fitness profile. Guest data was not changed.');
  if (await syncChoice() === 'enabled') throw Error('Pause cloud sync before importing guest data.');
  const guest = await SQLite.openDatabaseAsync('better-day.db');
  let guestProfile: { id: string } | null;
  try { guestProfile = await guest.getFirstAsync<{ id: string }>('SELECT id FROM profile LIMIT 1'); }
  catch { throw Error('No preserved guest profile was found on this device.'); }
  if (!guestProfile) throw Error('No preserved guest profile was found on this device.');
  const snapshots = [] as { name: SyncKind; rows: Record<string, string | number | null>[] }[];
  for (const name of upsertOrder) {
    const rows = await guest.getAllAsync<Record<string, string | number | null>>(`SELECT * FROM ${name}`);
    snapshots.push({ name, rows: name === 'exercises' ? rows.filter(row => row.custom === 1) : rows });
  }
  await target.withExclusiveTransactionAsync(async tx => {
    if (await tx.getFirstAsync('SELECT id FROM profile LIMIT 1')) throw Error('Account data changed during import');
    const choice = await tx.getFirstAsync<{ choice: string }>('SELECT choice FROM sync_control WHERE id=1');
    if (choice?.choice === 'enabled') throw Error('Pause cloud sync before importing guest data.');
    for (const snapshot of snapshots) for (const row of snapshot.rows) {
      const columns = Object.keys(row);
      await tx.runAsync(`INSERT OR IGNORE INTO ${snapshot.name} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`, ...Object.values(row));
    }
  });
  return snapshots.reduce((total, item) => total + item.rows.length, 0);
}
