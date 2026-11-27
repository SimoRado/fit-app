import { useSyncExternalStore } from 'react';

// An accepted request must unmount ordinary account providers before the first
// protected query is invalidated. The SecureStore receipt supplies restart state.
const blocked = new Set<string>();
const listeners = new Set<() => void>();
export function blockAccountForDeletion(userId: string) {
  blocked.add(userId);
  listeners.forEach(listener => listener());
}
export function unblockAccountAfterRejectedDeletion(userId: string) {
  blocked.delete(userId);
  listeners.forEach(listener => listener());
}
export function isAccountDeletionBlocked(userId: string | null | undefined) {
  return !!userId && blocked.has(userId);
}
export function accountDeletionView(args: {
  signedIn: boolean;
  userId: string | null | undefined;
  authenticated: boolean;
  pending: { userId: string; receipt: string }[] | null;
  current: { receipt: string; stage: string } | null | undefined;
  blocked: boolean;
}): 'loading' | 'progress' | 'account' | 'welcome' {
  const { signedIn, userId, authenticated, pending, current, blocked } = args;
  if (pending === null) return 'loading';
  const receipt = pending.find(item => item.userId === userId)?.receipt;
  if (signedIn && (blocked || !!receipt || !!current)) return 'progress';
  if (signedIn && !authenticated) return 'loading';
  if (signedIn && authenticated && !blocked && !receipt && current === undefined) return 'loading';
  if (!signedIn && pending.length) return 'progress';
  return signedIn ? 'account' : 'welcome';
}
export function useAccountDeletionBlocked(userId: string | null | undefined) {
  return useSyncExternalStore(
    listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => isAccountDeletionBlocked(userId),
    () => false,
  );
}
