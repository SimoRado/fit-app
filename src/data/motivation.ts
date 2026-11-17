import type { Queryable } from './habitHistory';
import { deckPreferenceKey, parseDeck, resolveDeck, serializeDeck, type DeckState } from '../core/motivationDeck';

/**
 * Motivation persistence. Reuses existing, already-synced tables only — no migration, no new
 * Convex record kind:
 *  - today's deck → `preferences` row `motivation.daily-deck.v1` (JSON, ~300 bytes);
 *  - favorites    → `favorites(card_id, owner_id)`.
 * Both are covered by the existing sync triggers, so they back up through Convex when cloud backup
 * is enabled and restore with the account. Each account has its own database file.
 */

/** Loads (and, at most once per day, writes) today's deck for this account. */
export async function loadDailyDeck(q: Queryable, ownerId: string, today: string, library: readonly string[]): Promise<DeckState> {
  const row = await q.getFirstAsync<{ value: string }>('SELECT value FROM preferences WHERE key=?', deckPreferenceKey);
  const { state, changed } = resolveDeck(parseDeck(row?.value), today, ownerId, library);
  // Upsert only when changed: re-reading the same day never touches the row (no sync churn).
  if (changed) await q.runAsync('INSERT INTO preferences(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', deckPreferenceKey, serializeDeck(state));
  return state;
}

/** Favorite card IDs, most recently saved first. */
export async function favoriteIds(q: Queryable, ownerId: string): Promise<string[]> {
  const rows = await q.getAllAsync<{ card_id: string }>('SELECT card_id FROM favorites WHERE owner_id=? ORDER BY rowid DESC', ownerId);
  return rows.map(row => row.card_id);
}

/** Idempotent: sets the saved state explicitly, so a repeated tap can never flip it twice. */
export async function setFavorite(q: Queryable, ownerId: string, cardId: string, saved: boolean) {
  if (saved) await q.runAsync('INSERT OR IGNORE INTO favorites(card_id, owner_id) VALUES (?,?)', cardId, ownerId);
  else await q.runAsync('DELETE FROM favorites WHERE owner_id=? AND card_id=?', ownerId, cardId);
}
