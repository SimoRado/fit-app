import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrations } from '../src/data/schema';
import { favoriteIds, loadDailyDeck, setFavorite } from '../src/data/motivation';
import type { Queryable } from '../src/data/habitHistory';
import { catalogIds, inCategory, motivationCard, motivationCatalog, motivationCategories, phraseRuns } from '../src/core/motivationCatalog';
import { FREE_DAILY, PRO_DAILY, SWIPE, clampIndex, releaseVelocity, dailyAllowance, deckPreferenceKey, dragOffset, fitPhrase, parseDeck, resolveDeck, selectDailyIds, serializeDeck, stepIndex, swipeDecision, visibleIds, wrapPhrase } from '../src/core/motivationDeck';
import { addDays } from '../src/core/date';
import { kinds, syncRecordFields } from '../convex/syncContract';

const library = catalogIds();

function open(owner = 'p', backup = false) {
  const db = new DatabaseSync(':memory:');
  for (const migration of migrations) db.exec(migration);
  if (backup) db.exec("UPDATE sync_control SET choice='enabled' WHERE id=1");
  db.prepare('INSERT INTO profile VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(owner, 'Alex', '1990-01-01', 175, 80, 75, 'Beginner', 'Health', '', 'en', '2026-11-01T08:00:00.000Z');
  const q: Queryable = {
    getAllAsync: async <T,>(sql: string, ...params: (string | number | null)[]) => db.prepare(sql).all(...params) as T[],
    getFirstAsync: async <T,>(sql: string, ...params: (string | number | null)[]) => (db.prepare(sql).get(...params) ?? null) as T | null,
    runAsync: async (sql: string, ...params: (string | number | null)[]) => db.prepare(sql).run(...params),
  };
  return { db, q };
}

describe('motivation catalog', () => {
  it('has stable unique IDs, keeps the original c1–c6 cards and covers every category', () => {
    expect(new Set(library).size).toBe(library.length);
    for (const id of ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']) expect(motivationCard(id)).toBeDefined();
    for (const category of motivationCategories) expect(motivationCatalog.filter(card => card.category === category).length).toBeGreaterThanOrEqual(5);
    expect(library.length).toBeGreaterThanOrEqual(PRO_DAILY * 3);
  });
  it('has every phrase in en/fr/ar with its accent as an exact substring', () => {
    for (const card of motivationCatalog) for (const lang of ['en', 'fr', 'ar'] as const) {
      expect(card.text[lang].length).toBeGreaterThan(8);
      const accent = card.accent?.[lang];
      if (accent) expect(card.text[lang]).toContain(accent);
      expect(phraseRuns(card, lang).map(run => run.text).join('')).toBe(card.text[lang]);
      expect(phraseRuns(card, lang).some(run => run.accent)).toBe(true);
    }
  });
  it('filters by primary or secondary category', () => {
    const m01 = motivationCard('m01')!;
    expect(inCategory(m01, 'All')).toBe(true);
    expect(inCategory(m01, 'Discipline')).toBe(true);
    expect(inCategory(m01, 'Consistency')).toBe(true);
    expect(inCategory(m01, 'Fitness')).toBe(false);
  });
});

describe('daily deck selection', () => {
  it('is deterministic for the same account and day, with no duplicates', () => {
    const a = selectDailyIds('user-1', '2026-11-17', library);
    expect(a).toEqual(selectDailyIds('user-1', '2026-11-17', library));
    expect(a).toHaveLength(PRO_DAILY);
    expect(new Set(a).size).toBe(PRO_DAILY);
    expect(a.every(id => library.includes(id))).toBe(true);
  });
  it('differs between days and between accounts', () => {
    expect(selectDailyIds('user-1', '2026-11-17', library)).not.toEqual(selectDailyIds('user-1', '2026-11-18', library));
    expect(selectDailyIds('user-1', '2026-11-17', library)).not.toEqual(selectDailyIds('user-2', '2026-11-17', library));
  });
  it('keeps the stored deck all day (restart / refresh never rerolls)', () => {
    const first = resolveDeck(null, '2026-11-17', 'u', library);
    expect(first.changed).toBe(true);
    const again = resolveDeck(parseDeck(serializeDeck(first.state)), '2026-11-17', 'u', library);
    expect(again.changed).toBe(false);
    expect(again.state.ids).toEqual(first.state.ids);
  });
  it('generates a new deck on the next local day and avoids repeating recent days', () => {
    let state = resolveDeck(null, '2026-11-17', 'u', library).state;
    const seen: string[][] = [state.ids];
    for (let d = 1; d <= 2; d++) {
      const next = resolveDeck(state, addDays('2026-11-17', d), 'u', library);
      expect(next.changed).toBe(true);
      for (const earlier of seen) expect(next.state.ids.some(id => earlier.includes(id))).toBe(false);
      seen.push(next.state.ids); state = next.state;
    }
  });
  it('handles reopening after several days and a clock moved backwards', () => {
    const monday = resolveDeck(null, '2026-11-16', 'u', library).state;
    const later = resolveDeck(monday, '2026-11-21', 'u', library);
    expect(later.state.day).toBe('2026-11-21');
    expect(later.state.ids.some(id => monday.ids.includes(id))).toBe(false);
    const back = resolveDeck(later.state, '2026-11-20', 'u', library);
    expect(back.state.day).toBe('2026-11-20');
    expect(new Set(back.state.ids).size).toBe(PRO_DAILY);
  });
  it('still fills a full deck when the library is small', () => {
    const small = library.slice(0, 12);
    let state = resolveDeck(null, '2026-11-17', 'u', small).state;
    for (let d = 1; d < 5; d++) { state = resolveDeck(state, addDays('2026-11-17', d), 'u', small).state; expect(new Set(state.ids).size).toBe(PRO_DAILY); }
  });
  it('tops up a deck whose card left the catalog without reordering the remaining cards', () => {
    const state = resolveDeck(null, '2026-11-17', 'u', library).state;
    const removed = state.ids[1];
    const next = resolveDeck(state, '2026-11-17', 'u', library.filter(id => id !== removed));
    expect(next.state.ids).toHaveLength(PRO_DAILY);
    expect(next.state.ids.slice(0, PRO_DAILY - 1)).toEqual(state.ids.filter(id => id !== removed));
  });
  it('treats corrupt stored values as missing instead of crashing', () => {
    for (const bad of ['', 'nope', '{"v":2}', '{"v":1,"day":"17-11-2026","ids":[]}', '{"v":1,"day":"2026-11-17","ids":[1,2]}']) expect(parseDeck(bad)).toBeNull();
  });
});

describe('Free / Pro allowance', () => {
  const state = resolveDeck(null, '2026-11-17', 'u', library).state;
  it('shows 3 cards for Free and 10 for Pro', () => {
    expect(dailyAllowance(false)).toBe(FREE_DAILY);
    expect(visibleIds(state, false)).toHaveLength(3);
    expect(visibleIds(state, true)).toHaveLength(10);
  });
  it('upgrading mid-day keeps the original three first and in order; expiry narrows back', () => {
    expect(visibleIds(state, true).slice(0, 3)).toEqual(visibleIds(state, false));
    expect(visibleIds(state, false)).toEqual(state.ids.slice(0, 3));
  });
  it('access never comes from the stored deck: a tampered deck cannot exceed the allowance', () => {
    const tampered = parseDeck(JSON.stringify({ ...state, ids: library.slice(0, 30), pro: true }))!;
    expect(visibleIds(tampered, false)).toHaveLength(3);
    expect(tampered.ids.length).toBeLessThanOrEqual(PRO_DAILY);
  });
});

describe('deck navigation and gesture rules', () => {
  it('steps without wrapping and clamps', () => {
    expect(stepIndex(0, -1, 4)).toBe(0);
    expect(stepIndex(0, 1, 4)).toBe(1);
    expect(stepIndex(3, 1, 4)).toBe(3);
    expect(clampIndex(9, 4)).toBe(3);
    expect(clampIndex(-2, 4)).toBe(0);
    let i = 0; for (let n = 0; n < 20; n++) i = stepIndex(i, 1, 4);
    expect(i).toBe(3);
  });
  it('commits past the 70 px prototype threshold; left = next, right = previous', () => {
    expect(SWIPE.threshold).toBe(70);
    expect(swipeDecision(-71, 0, true, true)).toBe(1);
    expect(swipeDecision(71, 0, true, true)).toBe(-1);
    expect(swipeDecision(-69, 0, true, true)).toBe(0);
    expect(swipeDecision(40, -100, true, true)).toBe(0);
  });
  it('commits a fast flick below the threshold only in the direction of travel', () => {
    expect(swipeDecision(-30, -900, true, true)).toBe(1);
    expect(swipeDecision(30, 900, true, true)).toBe(-1);
    expect(swipeDecision(-30, 900, true, true)).toBe(0);
    expect(swipeDecision(-10, -2000, true, true)).toBe(0); // a tap-jitter is not a flick
    expect(swipeDecision(-120, 1200, true, true)).toBe(0); // thrown back the other way
  });
  it('never commits past the first or last card and resists the drag there', () => {
    expect(swipeDecision(200, 0, false, true)).toBe(0);
    expect(swipeDecision(-200, 0, true, false)).toBe(0);
    expect(dragOffset(100, false, true)).toBeCloseTo(100 * SWIPE.edgeResistance);
    expect(dragOffset(100, true, true)).toBe(100);
    expect(dragOffset(-100, true, false)).toBeCloseTo(-100 * SWIPE.edgeResistance);
  });
});

describe('poster text fitting', () => {
  it('keeps short phrases big and fits long ones without breaking words', () => {
    const short = fitPhrase('TRUST THE REPS.', 300, 260);
    const long = fitPhrase('THE WORK YOU DO TODAY BUILDS THE PERSON YOU BECOME TOMORROW.', 300, 260);
    expect(short.fontSize).toBeGreaterThan(long.fontSize);
    expect(long.fontSize).toBeGreaterThanOrEqual(22);
    for (const card of motivationCatalog) {
      const text = card.text.en.toUpperCase();
      const fit = fitPhrase(text, 300, 260, { max: 44, min: 22 });
      const perLine = Math.floor(300 / (fit.fontSize * 0.66));
      expect(Math.max(...text.split(' ').map(word => word.length))).toBeLessThanOrEqual(perLine);
    }
  });
  it('wraps share-image lines and keeps accent words highlighted', () => {
    const lines = wrapPhrase(phraseRuns(motivationCard('m02')!, 'en'), 16);
    expect(lines.flat().map(word => word.text).join(' ')).toBe("You don't need to be perfect. You need to be consistent.");
    expect(lines.every(line => line.map(word => word.text).join(' ').length <= 16)).toBe(true);
    expect(lines.flat().filter(word => word.accent).map(word => word.text)).toEqual(['consistent.']);
  });
});

describe('motivation persistence (SQLite)', () => {
  it('writes the deck once per day and reuses it on reopen', async () => {
    const { db, q } = open('p', true);
    const first = await loadDailyDeck(q, 'p', '2026-11-17', library);
    const row = db.prepare('SELECT value FROM preferences WHERE key=?').get(deckPreferenceKey) as { value: string };
    expect(parseDeck(row.value)?.ids).toEqual(first.ids);
    const outboxBefore = (db.prepare('SELECT COUNT(*) AS n FROM sync_outbox').get() as { n: number }).n;
    const second = await loadDailyDeck(q, 'p', '2026-11-17', library);
    expect(second.ids).toEqual(first.ids);
    expect((db.prepare('SELECT COUNT(*) AS n FROM sync_outbox').get() as { n: number }).n).toBe(outboxBefore);
    const tuesday = await loadDailyDeck(q, 'p', '2026-11-18', library);
    expect(tuesday.day).toBe('2026-11-18');
    expect(tuesday.recent.slice(0, PRO_DAILY)).toEqual(first.ids);
  });
  it('stores favorites idempotently, newest first, and survives a new day', async () => {
    const { q } = open();
    await setFavorite(q, 'p', 'm02', true);
    await setFavorite(q, 'p', 'm02', true);
    await setFavorite(q, 'p', 'c1', true);
    expect(await favoriteIds(q, 'p')).toEqual(['c1', 'm02']);
    await loadDailyDeck(q, 'p', '2026-11-17', library);
    await loadDailyDeck(q, 'p', '2026-11-18', library);
    expect(await favoriteIds(q, 'p')).toEqual(['c1', 'm02']);
    await setFavorite(q, 'p', 'm02', false);
    await setFavorite(q, 'p', 'm02', false);
    expect(await favoriteIds(q, 'p')).toEqual(['c1']);
  });
  it('isolates accounts: favorites and decks never leak between owners', async () => {
    const a = open('a'), b = open('b');
    await setFavorite(a.q, 'a', 'm05', true);
    expect(await favoriteIds(b.q, 'b')).toEqual([]);
    expect(await favoriteIds(a.q, 'b')).toEqual([]);
    const deckA = await loadDailyDeck(a.q, 'a', '2026-11-17', library);
    const deckB = await loadDailyDeck(b.q, 'b', '2026-11-17', library);
    expect(deckA.ids).not.toEqual(deckB.ids);
  });
  it('queues nothing for the cloud without backup consent', async () => {
    const { db, q } = open();
    await loadDailyDeck(q, 'p', '2026-11-17', library);
    await setFavorite(q, 'p', 'm02', true);
    expect(db.prepare('SELECT COUNT(*) AS n FROM sync_outbox').get()).toEqual({ n: 0 });
  });
  it('queues both records for cloud backup through the existing sync kinds', async () => {
    const { db, q } = open('p', true);
    await loadDailyDeck(q, 'p', '2026-11-17', library);
    await setFavorite(q, 'p', 'm02', true);
    const rows = db.prepare('SELECT kind, record_id FROM sync_outbox').all() as { kind: string; record_id: string }[];
    expect(rows).toContainEqual(expect.objectContaining({ kind: 'preferences', record_id: deckPreferenceKey }));
    expect(rows).toContainEqual(expect.objectContaining({ kind: 'favorites', record_id: 'p:m02' }));
    expect(kinds).toContain('preferences');
    expect(kinds).toContain('favorites');
    expect(syncRecordFields.preferences).toEqual(['key', 'value']);
    expect(serializeDeck(resolveDeck(null, '2026-11-17', 'p', library).state).length).toBeLessThan(2000); // Convex string limit
  });
});

describe('motivation screen wiring', () => {
  const screen = readFileSync('src/app/motivation.tsx', 'utf8');
  const deck = readFileSync('src/ui/motivation/SwipeDeck.tsx', 'utf8');
  it('gates the allowance on the live RevenueCat entitlement and opens the existing paywall', () => {
    expect(screen).toContain('subscription.isPremium');
    expect(screen).toContain('visibleIds(deck, isPro)');
    expect(screen).toContain("router.push('/paywall')");
  });
  it('clears account-scoped in-memory cards during account switches and offers a retry instead of an endless loader', () => {
    expect(screen).toContain('setDeck(null); setDeckError(null); setSaved([]); setShareCard(null);');
    expect(screen).toContain('setDeckError(\'Your cards could not be loaded.\')');
    expect(screen).toContain('<DeckLoadFailure');
  });
  it('drives the card on the UI thread and routes the arrows through the same animation', () => {
    expect(deck).toContain('usePanGesture');
    expect(deck).toContain('useAnimatedStyle');
    expect(deck).not.toMatch(/onUpdate[^}]*runOnJS/);
    expect(screen).toContain('deckRef.current?.go(-1)');
    expect(screen).toContain('deckRef.current?.go(1)');
  });
});

describe('release velocity', () => {
  it('uses the deck’s own measurement when the reported flick velocity reads low', () => {
    expect(releaseVelocity(-200, -40, 50)).toBe(-800);
    expect(releaseVelocity(-900, -10, 50)).toBe(-900);
    expect(releaseVelocity(300, -40, 50)).toBe(300); // opposite directions: trust the handler
    expect(releaseVelocity(-200, -40, 5)).toBe(-200); // window too short to be meaningful
    expect(releaseVelocity(-200, -40, 400)).toBe(-200); // stale sample
    expect(swipeDecision(-50, releaseVelocity(-200, -40, 50), true, true)).toBe(1);
  });
});
