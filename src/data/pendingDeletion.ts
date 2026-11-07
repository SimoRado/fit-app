import * as SecureStore from 'expo-secure-store';

const key = 'fitapp.pendingAccountDeletions';
export type PendingDeletion = { userId: string; receipt: string };
export async function pendingDeletions(): Promise<PendingDeletion[]> {
  const saved = await SecureStore.getItemAsync(key);
  if (!saved) return [];
  try {
    const values: unknown = JSON.parse(saved);
    return Array.isArray(values) ? values.filter((item): item is PendingDeletion => !!item && typeof item.userId === 'string' && /^user_[A-Za-z0-9]+$/.test(item.userId) && typeof item.receipt === 'string' && item.receipt.length >= 60 && item.receipt.length <= 100) : [];
  } catch { return []; }
}
export async function rememberDeletion(item: PendingDeletion) {
  const current = await pendingDeletions();
  await SecureStore.setItemAsync(key, JSON.stringify([...current.filter(value => value.userId !== item.userId), item]));
}
export async function forgetDeletion(userId: string) {
  await SecureStore.setItemAsync(key, JSON.stringify((await pendingDeletions()).filter(value => value.userId !== userId)));
}
