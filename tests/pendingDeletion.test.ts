import { beforeEach, describe, expect, it, vi } from 'vitest';
const values = vi.hoisted(() => new Map<string, string>());
vi.mock('expo-secure-store', () => ({ getItemAsync: async (key: string) => values.get(key) ?? null, setItemAsync: async (key: string, value: string) => { values.set(key, value); } }));
import { forgetDeletion, pendingDeletions, rememberDeletion } from '../src/data/pendingDeletion';

beforeEach(() => values.clear());
describe('pending local account deletion', () => {
  it('keeps receipts separate by account and removes only the completed account', async () => {
    await rememberDeletion({ userId: 'user_A', receipt: 'a'.repeat(72) });
    await rememberDeletion({ userId: 'user_B', receipt: 'b'.repeat(72) });
    await rememberDeletion({ userId: 'user_A', receipt: 'c'.repeat(72) });
    expect(await pendingDeletions()).toEqual([{ userId: 'user_B', receipt: 'b'.repeat(72) }, { userId: 'user_A', receipt: 'c'.repeat(72) }]);
    await forgetDeletion('user_A');
    expect(await pendingDeletions()).toEqual([{ userId: 'user_B', receipt: 'b'.repeat(72) }]);
  });
});
