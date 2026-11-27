import { describe, expect, it, vi } from 'vitest';

const sqlite = vi.hoisted(() => ({ deleteDatabaseAsync: vi.fn(async (_name: string) => {}) }));
vi.mock('expo-sqlite', () => ({ deleteDatabaseAsync: sqlite.deleteDatabaseAsync }));
vi.mock('../src/core/monitoring', () => ({ reportFailure: vi.fn() }));
import { removeLocalAccountData, setLocalAccount } from '../src/data/db';

describe('completed account local cleanup', () => {
  it('deletes only the matching account database, which contains its offline queue', async () => {
    setLocalAccount('user_A');
    await removeLocalAccountData('user_A');
    expect(sqlite.deleteDatabaseAsync).toHaveBeenCalledExactlyOnceWith('better-day-user_A.db');
    expect(sqlite.deleteDatabaseAsync).not.toHaveBeenCalledWith('better-day-user_B.db');
    expect(sqlite.deleteDatabaseAsync).not.toHaveBeenCalledWith('better-day.db');
  });
});
