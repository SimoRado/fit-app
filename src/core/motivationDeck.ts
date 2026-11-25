/**
 * Daily Motivation deck — pure logic (no React, no SQLite) so it is unit tested.
 *
 * Each local calendar day an account gets one ordered selection of PRO_DAILY card IDs. It is
 * persisted (preferences table, synced like any preference) the first time that day's deck is
 * needed, so restarting, refreshing Metro or switching tabs never rerolls it. Free accounts see the
 * first FREE_DAILY cards of that same list and Pro accounts see all of it, so upgrading mid-day
 * keeps the original cards and their order, and an expired subscription only narrows the view.
 * Access is always computed from the live entitlement — the stored deck never grants Pro.
 */
export const FREE_DAILY = 3;
export const PRO_DAILY = 10;
/** Previous days' cards avoided when the library is large enough. */
export const RECENT_MEMORY = 20;
export const deckPreferenceKey = 'motivation.daily-deck.v1';

export type DeckState = { v: 1; day: string; ids: string[]; recent: string[] };

export const dailyAllowance = (isPro: boolean) => (isPro ? PRO_DAILY : FREE_DAILY);

/** cyrb53-style string hash → 32-bit seed. Stable across platforms/JS engines. */
export function hashSeed(input: string) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

/** mulberry32 PRNG. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], seed: number) {
  const out = [...items];
  const next = random(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Deterministic ordered selection for (account, day). Cards in `avoid` (recent days) are used only
 * when the rest of the library cannot fill the deck. `keep` (already-shown IDs for this day) stay
 * first and in order — used to top up a deck whose cards were removed from the catalog.
 */
export function selectDailyIds(ownerId: string, day: string, library: readonly string[], avoid: readonly string[] = [], keep: readonly string[] = [], size = PRO_DAILY) {
  const unique = [...new Set(library)];
  const kept = [...new Set(keep)].filter(id => unique.includes(id)).slice(0, size);
  const avoided = new Set(avoid);
  const order = shuffled(unique, hashSeed(`${ownerId}|${day}|motivation`));
  const fresh = order.filter(id => !kept.includes(id) && !avoided.has(id));
  const stale = order.filter(id => !kept.includes(id) && avoided.has(id));
  return [...kept, ...fresh, ...stale].slice(0, Math.min(size, unique.length));
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Parses a stored deck; anything malformed is treated as missing (never throws). */
export function parseDeck(value: string | null | undefined): DeckState | null {
  if (!value) return null;
  try {
    const raw = JSON.parse(value) as Partial<DeckState>;
    if (raw?.v !== 1 || typeof raw.day !== 'string' || !DAY.test(raw.day) || !Array.isArray(raw.ids) || !raw.ids.every(id => typeof id === 'string')) return null;
    const recent = Array.isArray(raw.recent) ? raw.recent.filter((id): id is string => typeof id === 'string') : [];
    return { v: 1, day: raw.day, ids: [...new Set(raw.ids)].slice(0, PRO_DAILY), recent: recent.slice(0, RECENT_MEMORY) };
  } catch { return null; }
}

export const serializeDeck = (state: DeckState) => JSON.stringify(state);

/**
 * Returns today's deck, generating it only when the stored one is missing, from another day, or
 * references cards no longer in the catalog. `changed` says whether it must be written back.
 * Works the same whether the app was closed for minutes or several days.
 */
export function resolveDeck(stored: DeckState | null, today: string, ownerId: string, library: readonly string[]): { state: DeckState; changed: boolean } {
  const known = new Set(library);
  const target = Math.min(PRO_DAILY, known.size);
  if (stored && stored.day === today) {
    const valid = stored.ids.filter(id => known.has(id));
    if (valid.length === stored.ids.length && valid.length >= target) return { state: stored, changed: false };
    const ids = selectDailyIds(ownerId, today, library, stored.recent, valid);
    return { state: { ...stored, ids }, changed: true };
  }
  // A new day (or the first ever): remember the previous selection so it is not repeated at once.
  const recent = stored ? [...new Set([...stored.ids, ...stored.recent])].slice(0, RECENT_MEMORY) : [];
  // If the library cannot fill a deck while avoiding all of `recent`, avoid the newest part only.
  const avoid = recent.slice(0, Math.max(0, Math.min(recent.length, known.size - target)));
  return { state: { v: 1, day: today, ids: selectDailyIds(ownerId, today, library, avoid), recent }, changed: true };
}

/** The cards this account may see today: Free = first 3, Pro = all 10, order preserved. */
export const visibleIds = (state: DeckState, isPro: boolean) => state.ids.slice(0, dailyAllowance(isPro));

// ---------------------------------------------------------------- swipe deck rules

/** Measured from the original Volt prototype (`.mwrap`): 70 px threshold, 230 ms ease exit to ±420 px, rotate(dx/24). */
export const SWIPE = { threshold: 70, flickVelocity: 650, flickMinDistance: 24, exitDistance: 420, exitMs: 230, rotateDivisor: 24, revealDistance: 140, edgeResistance: 0.28 } as const;

/**
 * Release decision. Returns +1 (advance), -1 (go back) or 0 (snap back). Dragging left (negative
 * dx) advances, as in the prototype. A fast flick commits even below the distance threshold, but
 * only in the direction of travel, and never past the first or last card.
 */
export function swipeDecision(dx: number, vx: number, canPrev: boolean, canNext: boolean) {
  'worklet';
  let dir = 0;
  if (Math.abs(dx) > SWIPE.threshold) dir = dx < 0 ? 1 : -1;
  else if (Math.abs(vx) > SWIPE.flickVelocity && Math.abs(dx) > SWIPE.flickMinDistance && Math.sign(vx) === Math.sign(dx)) dir = dx < 0 ? 1 : -1;
  // A drag that is clearly reversed at release (thrown back) cancels.
  if (dir !== 0 && Math.abs(vx) > SWIPE.flickVelocity && Math.sign(vx) !== Math.sign(dx)) dir = 0;
  if (dir === 1 && !canNext) return 0;
  if (dir === -1 && !canPrev) return 0;
  return dir;
}

/**
 * Release velocity (pt/s). Gesture Handler's value comes from the last few touch events and can
 * read low on a short, quick flick; the deck also measures travel over the last ~60–120 ms itself.
 * The stronger reading wins when both point the same way; a too-short (< 20 ms) or stale (> 150 ms) sample is ignored.
 */
export function releaseVelocity(reported: number, travel: number, elapsedMs: number) {
  'worklet';
  if (elapsedMs < 20 || elapsedMs > 150) return reported;
  const measured = (travel / elapsedMs) * 1000;
  if (reported !== 0 && Math.sign(measured) !== Math.sign(reported)) return reported;
  return Math.abs(measured) > Math.abs(reported) ? measured : reported;
}

/** The deck claims a touch once it moves 8 px sideways, unless it first moved 14 px vertically. */
export function deckShouldClaim(dx: number, dy: number) {
  return Math.abs(dx) > 8 && Math.abs(dy) < 14 && Math.abs(dx) > Math.abs(dy);
}

/** Finger → card offset; past the first/last card the card resists instead of following 1:1. */
export function dragOffset(dx: number, canPrev: boolean, canNext: boolean) {
  'worklet';
  if ((dx > 0 && !canPrev) || (dx < 0 && !canNext)) return dx * SWIPE.edgeResistance;
  return dx;
}

/** Logical navigation: clamps, never wraps (the deck is a finite daily allowance). */
export function stepIndex(index: number, dir: number, count: number) {
  'worklet';
  const next = index + dir;
  return next < 0 || next >= count ? index : next;
}

export const clampIndex = (index: number, count: number) => (count <= 0 ? 0 : Math.max(0, Math.min(count - 1, Math.floor(index))));

// ---------------------------------------------------------------- phrase fitting

/**
 * Picks the largest poster font size whose greedy line wrap fits the text box. Character widths
 * are a conservative estimate for the heavy uppercase display face (~0.66 em), so text is never
 * clipped; it stays at least `min` px so short and long phrases keep the poster look.
 */
export function fitPhrase(text: string, width: number, height: number, { max = 44, min = 22, lineHeight = 0.98, charWidth = 0.66 } = {}) {
  const words = text.split(/\s+/).filter(Boolean);
  const linesAt = (size: number) => {
    const perLine = Math.max(1, Math.floor(width / (size * charWidth)));
    let lines = 1, used = 0;
    for (const word of words) {
      const length = word.length;
      if (length > perLine) return Infinity; // a single word would break mid-word
      if (used === 0) used = length;
      else if (used + 1 + length <= perLine) used += 1 + length;
      else { lines++; used = length; }
    }
    return lines;
  };
  for (let size = max; size > min; size -= 1) {
    const lines = linesAt(size);
    if (lines !== Infinity && lines * size * lineHeight <= height) return { fontSize: size, lineHeight: Math.round(size * lineHeight) };
  }
  return { fontSize: min, lineHeight: Math.round(min * lineHeight) };
}

/**
 * Greedy word wrap for the exported share image (SVG has no automatic wrapping). Each word keeps
 * `accent: true` when it overlaps the highlighted phrase.
 */
export function wrapPhrase(runs: readonly { text: string; accent: boolean }[], perLine: number) {
  const words: { text: string; accent: boolean }[] = [];
  let pending: { text: string; accent: boolean } | null = null;
  for (const run of runs) {
    for (const [i, part] of run.text.split(/(\s+)/).entries()) {
      if (i % 2 === 1) { if (pending) { words.push(pending); pending = null; } continue; }
      if (!part) continue;
      pending = pending ? { text: pending.text + part, accent: pending.accent || run.accent } : { text: part, accent: run.accent };
    }
  }
  if (pending) words.push(pending);
  const lines: { text: string; accent: boolean }[][] = [];
  let line: { text: string; accent: boolean }[] = [], used = 0;
  for (const word of words) {
    const extra = (used ? 1 : 0) + word.text.length;
    if (used && used + extra > perLine) { lines.push(line); line = []; used = 0; }
    line.push(word); used += (used ? 1 : 0) + word.text.length;
  }
  if (line.length) lines.push(line);
  return lines;
}
