import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ openDatabaseAsync: vi.fn(), importExerciseCatalog: vi.fn() }));
vi.mock('expo-sqlite', () => ({ openDatabaseAsync: mocks.openDatabaseAsync }));
vi.mock('../src/data/schema', () => ({ migrations: [], exerciseSeeds: [] }));
vi.mock('../src/data/exerciseCatalog', () => ({ importExerciseCatalog: mocks.importExerciseCatalog, normalizeExerciseText: vi.fn(), exerciseSearchStatement: vi.fn(() => ({ sql: '', args: [] })) }));
vi.mock('../src/core/monitoring', () => ({ reportFailure: vi.fn() }));

import { db, ensureExerciseCatalog, exerciseCatalogState, setLocalAccount } from '../src/data/db';

beforeEach(() => {
  mocks.openDatabaseAsync.mockReset();
  mocks.importExerciseCatalog.mockReset().mockResolvedValue(undefined);
});

function connection() {
  return {
    execAsync: vi.fn(async (_sql: string) => undefined),
    getFirstAsync: vi.fn(async () => ({ user_version: 0 })),
    withExclusiveTransactionAsync: vi.fn(async (work: (tx: unknown) => Promise<void>) => work({})),
    closeAsync: vi.fn(async () => undefined),
  };
}

describe('local database initialization recovery', () => {
  it('retries a transient open failure for the same account', async () => {
    const recovered = connection();
    mocks.openDatabaseAsync.mockRejectedValueOnce(Error('temporary storage error')).mockResolvedValueOnce(recovered);
    setLocalAccount('user_A123');
    await expect(db()).rejects.toThrow('temporary storage error');
    await expect(db()).resolves.toBe(recovered);
    expect(mocks.openDatabaseAsync).toHaveBeenCalledTimes(2);
    setLocalAccount(null);
  });

  it('closes a failed initialization before retrying without changing account', async () => {
    const failed = connection();
    failed.execAsync.mockRejectedValueOnce(Error('temporary pragma error'));
    const recovered = connection();
    mocks.openDatabaseAsync.mockResolvedValueOnce(failed).mockResolvedValueOnce(recovered);
    setLocalAccount('user_B456');
    await expect(db()).rejects.toThrow('temporary pragma error');
    expect(failed.closeAsync).toHaveBeenCalledOnce();
    await expect(db()).resolves.toBe(recovered);
    expect(mocks.openDatabaseAsync).toHaveBeenCalledTimes(2);
    setLocalAccount(null);
  });

  it('opens the database without waiting for the exercise catalog and retries a failed catalog import', async () => {
    const opened = connection();
    mocks.openDatabaseAsync.mockResolvedValueOnce(opened);
    mocks.importExerciseCatalog.mockRejectedValueOnce(Error('temporary catalog import error'));
    setLocalAccount('user_C789');
    await expect(db()).resolves.toBe(opened);
    expect(mocks.importExerciseCatalog).not.toHaveBeenCalled();
    await expect(ensureExerciseCatalog()).rejects.toThrow('temporary catalog import error');
    expect(exerciseCatalogState()).toMatchObject({ status: 'error' });
    await expect(ensureExerciseCatalog()).resolves.toBeUndefined();
    expect(exerciseCatalogState()).toMatchObject({ status: 'ready' });
    await expect(ensureExerciseCatalog()).resolves.toBeUndefined();
    expect(mocks.importExerciseCatalog).toHaveBeenCalledTimes(2);
    expect(opened.closeAsync).not.toHaveBeenCalled();
    setLocalAccount(null);
  });

  it('serializes exclusive transactions on one writer connection with a busy timeout', async () => {
    const main = connection();
    const writer = connection();
    const order: string[] = [];
    writer.execAsync.mockImplementation(async (sql: string) => { order.push(sql); return undefined; });
    mocks.openDatabaseAsync.mockResolvedValueOnce(main).mockResolvedValueOnce(writer);
    setLocalAccount('user_D012');
    const database = await db();
    expect(main.execAsync).toHaveBeenCalledWith(expect.stringContaining('PRAGMA busy_timeout = 5000'));
    expect(main.getFirstAsync).toHaveBeenCalledWith('PRAGMA journal_mode = WAL');
    let release!: () => void;
    const first = database.withExclusiveTransactionAsync(async () => { order.push('first'); await new Promise<void>(resolve => { release = resolve; }); });
    const second = database.withExclusiveTransactionAsync(async () => { order.push('second'); });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(order).toEqual(['PRAGMA busy_timeout = 5000;', 'BEGIN IMMEDIATE', 'first']);
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(['PRAGMA busy_timeout = 5000;', 'BEGIN IMMEDIATE', 'first', 'COMMIT', 'BEGIN IMMEDIATE', 'second', 'COMMIT']);
    expect(mocks.openDatabaseAsync).toHaveBeenCalledTimes(2);
    await expect(database.withExclusiveTransactionAsync(async () => { throw Error('write failed'); })).rejects.toThrow('write failed');
    expect(order.at(-1)).toBe('ROLLBACK');
    setLocalAccount(null);
  });
});
