import { describe, expect, it } from 'vitest';
import { accountDeletionView, blockAccountForDeletion, isAccountDeletionBlocked, unblockAccountAfterRejectedDeletion } from '../src/data/deletionLifecycle';

const receipt = 'a'.repeat(72);
const base = { signedIn: true, userId: 'user_A', authenticated: true, pending: [] as { userId: string; receipt: string }[], current: null, blocked: false };

describe('account deletion navigation gate', () => {
  it('waits for receipt and job discovery before mounting normal account queries', () => {
    expect(accountDeletionView({ ...base, pending: null })).toBe('loading');
    expect(accountDeletionView({ ...base, authenticated: false })).toBe('loading');
    expect(accountDeletionView({ ...base, current: undefined })).toBe('loading');
    expect(accountDeletionView(base)).toBe('account');
  });
  it('blocks normal account providers immediately and across a restart', () => {
    blockAccountForDeletion('user_A');
    expect(isAccountDeletionBlocked('user_A')).toBe(true);
    expect(isAccountDeletionBlocked('user_B')).toBe(false);
    expect(accountDeletionView({ ...base, blocked: true })).toBe('progress');
    unblockAccountAfterRejectedDeletion('user_A');
    expect(accountDeletionView({ ...base, pending: [{ userId: 'user_A', receipt }], current: undefined })).toBe('progress');
    expect(accountDeletionView({ ...base, authenticated: false, pending: [{ userId: 'user_A', receipt }], current: undefined })).toBe('progress');
    expect(accountDeletionView({ ...base, current: { receipt, stage: 'cloud_pending' } })).toBe('progress');
  });
  it('continues progress after Clerk signs out, and reaches Welcome only after the receipt is removed', () => {
    expect(accountDeletionView({ ...base, signedIn: false, userId: null, authenticated: false, pending: [{ userId: 'user_A', receipt }], current: undefined })).toBe('progress');
    expect(accountDeletionView({ ...base, signedIn: false, userId: null, authenticated: false, pending: [], current: undefined })).toBe('welcome');
    expect(accountDeletionView({ ...base, userId: 'user_B', pending: [{ userId: 'user_A', receipt }] })).toBe('account');
  });
});
