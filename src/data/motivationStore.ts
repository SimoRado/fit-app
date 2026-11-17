import { db } from './db';
import { favoriteIds, loadDailyDeck, setFavorite } from './motivation';

/** App-facing wrappers on the signed-in account's database. */
export const motivationStore = {
  deck: async (ownerId: string, today: string, library: readonly string[]) => loadDailyDeck(await db(), ownerId, today, library),
  favorites: async (ownerId: string) => favoriteIds(await db(), ownerId),
  setFavorite: async (ownerId: string, cardId: string, saved: boolean) => {
    const d = await db();
    await d.withExclusiveTransactionAsync(async tx => { await setFavorite(tx, ownerId, cardId, saved); });
  },
};
