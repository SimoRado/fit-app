import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ openDatabaseAsync: vi.fn(), importExerciseCatalog: vi.fn() }));
vi.mock('expo-sqlite', () => ({ openDatabaseAsync: mocks.openDatabaseAsync }));
vi.mock('../src/data/schema', () => ({ migrations: [], exerciseSeeds: [] }));
vi.mock('../src/data/exerciseCatalog', () => ({ importExerciseCatalog: mocks.importExerciseCatalog, normalizeExerciseText: vi.fn(), exerciseSearchQuery: '' }));
vi.mock('../src/core/monitoring', () => ({ reportFailure: vi.fn() }));

import { db, setLocalAccount } from '../src/data/db';

beforeEach(() => {
  mocks.openDatabaseAsync.mockReset();
  mocks.importExerciseCatalog.mockReset().mockResolvedValue(undefined);
});

function connection() {
  return {
    execAsync: vi.fn(async () => undefined),
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
    const recovered = connection();
    mocks.openDatabaseAsync.mockResolvedValueOnce(failed).mockResolvedValueOnce(recovered);
    mocks.importExerciseCatalog.mockRejectedValueOnce(Error('temporary catalog import error'));
    setLocalAccount('user_B456');
    await expect(db()).rejects.toThrow('temporary catalog import error');
    expect(failed.closeAsync).toHaveBeenCalledOnce();
    await expect(db()).resolves.toBe(recovered);
    expect(mocks.openDatabaseAsync).toHaveBeenCalledTimes(2);
    setLocalAccount(null);
  });
});
