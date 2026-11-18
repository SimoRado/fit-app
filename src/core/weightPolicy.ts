/**
 * Weight-entry rules.
 *
 * Only the current local calendar day's weigh-in can be created or changed.
 * Every earlier weigh-in is read-only history: it cannot be edited, moved to
 * another date, or deleted through the app's weight features. (Account
 * deletion and cloud restore use their own storage paths and are unaffected.)
 *
 * "Today" is always the device's local calendar day at the moment of the write
 * (`dayKey()`), never a date supplied by a screen, so a stale screen, a changed
 * clock or a malformed date cannot reach an older record.
 */
import { validDay } from './date';
import type { WeightEntry } from './types';

export const MIN_WEIGHT_KG = 20;
export const MAX_WEIGHT_KG = 500;

export class WeightHistoryLockedError extends Error {
  constructor(message = 'Earlier weigh-ins are kept as history and cannot be changed. You can add or update today’s weight.') {
    super(message);
    this.name = 'WeightHistoryLockedError';
  }
}

export function validWeightKg(kg: number) {
  return Number.isFinite(kg) && kg >= MIN_WEIGHT_KG && kg <= MAX_WEIGHT_KG;
}

/** True only for a well-formed key equal to the current local day. */
export function isTodayWeightDay(day: string, today: string) {
  return validDay(today) && validDay(day) && day === today;
}

/** Today's weigh-in. If several rows exist for today (older app versions), the newest one is today's value. */
export function todaysWeightEntry(entries: readonly WeightEntry[], today: string): WeightEntry | undefined {
  return entries.filter(entry => entry.day === today).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

/**
 * Throws unless writing `next` is allowed: it must be dated today and, when it
 * replaces a stored row (same id), that stored row must also be today's.
 */
export function assertWeightWrite(next: WeightEntry, stored: WeightEntry | null | undefined, today: string) {
  if (!validDay(today)) throw new WeightHistoryLockedError('The device date could not be read. Please try again.');
  if (!validDay(next.day)) throw new Error('Enter a valid date.');
  if (!validWeightKg(next.kg)) throw new Error(`Weight must be ${MIN_WEIGHT_KG}–${MAX_WEIGHT_KG} kg.`);
  if (stored && stored.day !== today) throw new WeightHistoryLockedError();
  if (next.day !== today) throw new WeightHistoryLockedError();
}

/** Throws unless `stored` is today's weigh-in. */
export function assertWeightDelete(stored: WeightEntry | null | undefined, today: string) {
  if (!stored) return;
  if (!isTodayWeightDay(stored.day, today)) throw new WeightHistoryLockedError();
}

/**
 * The row to save for "add or update today's weight": today's existing row
 * keeps its id, date and creation time (so it is updated, never duplicated);
 * otherwise a new row dated today is created.
 */
export function prepareTodayWeight(input: { entries: readonly WeightEntry[]; today: string; kg: number; note?: string; ownerId: string; now: string; newId: () => string }): WeightEntry {
  const { entries, today, kg, ownerId, now, newId } = input;
  if (!validDay(today)) throw new WeightHistoryLockedError('The device date could not be read. Please try again.');
  if (!validWeightKg(kg)) throw new Error(`Weight must be ${MIN_WEIGHT_KG}–${MAX_WEIGHT_KG} kg.`);
  const existing = todaysWeightEntry(entries, today);
  const note = (input.note ?? existing?.note ?? '').trim();
  return existing
    ? { ...existing, kg, note }
    : { id: newId(), owner_id: ownerId, day: today, kg, note, created_at: now };
}

export type WeightGoal = {
  direction: 'lose' | 'gain' | 'maintain';
  /** 0–100 share of the start→target distance covered; null without a target. */
  progress: number | null;
  /** Remaining kilograms to the target (0 once reached or passed); null without a target. */
  toGo: number | null;
  /** Signed change since the starting weight (current − start). */
  change: number;
  reached: boolean;
  /** Current weight is on the opposite side of the start from the target. */
  movingAway: boolean;
};

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * Goal progress that works for weight loss, weight gain and maintenance.
 * `start` is the original starting weight from the profile and is never
 * changed by later weigh-ins.
 */
export function weightGoal(start: number, current: number, target: number | null | undefined): WeightGoal {
  const change = round1(current - start);
  if (target == null || !Number.isFinite(target)) return { direction: 'maintain', progress: null, toGo: null, change, reached: false, movingAway: false };
  const span = target - start;
  const direction: WeightGoal['direction'] = Math.abs(span) < 0.05 ? 'maintain' : span < 0 ? 'lose' : 'gain';
  if (direction === 'maintain') {
    const off = round1(Math.abs(current - target));
    return { direction, progress: off < 0.05 ? 100 : 0, toGo: off, change, reached: off < 0.05, movingAway: false };
  }
  const covered = (current - start) / span;
  const reached = covered >= 1 - 1e-9;
  const movingAway = covered < 0 && Math.abs(current - start) >= 0.05;
  return {
    direction,
    progress: Math.max(0, Math.min(100, Math.round(covered * 100))),
    toGo: reached ? 0 : round1(Math.abs(target - current)),
    change,
    reached,
    movingAway,
  };
}
