import { addDays, dayKey, fromDay } from './date';
import { scheduled } from './logic';
import { dayTarget } from './habitProgress';
import type { Habit, HabitCompletion, HabitProgress } from './types';

/**
 * Habits History — pure maths shared by SQLite reconciliation, the History sheet and tests.
 *
 * A day's result is a snapshot of what was true *on that day*: which habits were eligible, their
 * names/targets at the time and whether each was fully completed. Snapshots are written to
 * `habit_days` and frozen before any later habit change, so adding, editing or deleting a habit
 * never rewrites an earlier percentage. Only an explicit progress edit for that day may patch it.
 */

/** One habit as it stood on a historical day. Short keys keep the synced row compact. */
export type HistoryItem = {
  /** habit id */ h: string;
  /** name on that day */ n: string;
  /** icon */ i: string;
  /** category */ c: string;
  /** 'b' yes/no, 'q' measured */ t: 'b' | 'q';
  /** fully completed (counts towards the percentage) */ d: 0 | 1;
  /** measured only: target, achieved amount, unit */ g?: number; a?: number; u?: string;
};

export type DayStatus = 'open' | 'final';
/** `tracked`: recorded live by this app. `reconstructed`: one-time backfill from older saved records. */
export type DaySource = 'tracked' | 'reconstructed';
export type HistoryDay = { day: string; status: DayStatus; source: DaySource; eligible: number; completed: number; percent: number; items?: HistoryItem[] };
export type HistoryDayRow = { id: string; owner_id: string; day: string; status: DayStatus; source: DaySource; eligible: number; completed: number; percent: number; items: string; updated_at: string };

/** Days reconstructed from older records are capped so a first launch never scans years of data. */
export const RECONSTRUCT_MAX_DAYS = 730;

export const historyId = (ownerId: string, day: string) => `${ownerId}:${day}`;
export const localDayOf = (iso: string) => { const date = new Date(iso); return Number.isFinite(date.getTime()) ? dayKey(date) : null; };

export type Evidence = { completions: Set<string>; progress: Map<string, Pick<HabitProgress, 'amount' | 'target_snapshot' | 'unit_snapshot'>> };
export function evidence(completions: Pick<HabitCompletion, 'habit_id' | 'day'>[], progress: Pick<HabitProgress, 'habit_id' | 'day' | 'amount' | 'target_snapshot' | 'unit_snapshot'>[]): Evidence {
  return {
    completions: new Set(completions.map(row => `${row.habit_id}:${row.day}`)),
    progress: new Map(progress.map(row => [`${row.habit_id}:${row.day}`, row])),
  };
}

/** Same rule as the Habits page: measured = amount ≥ that day's target; yes/no = a completion exists. */
export function itemFor(habit: Habit, day: string, proof: Evidence): HistoryItem {
  const key = `${habit.id}:${day}`;
  const base = { h: habit.id, n: habit.name, i: habit.icon, c: habit.category };
  if (habit.habit_type === 'quantity') {
    const row = proof.progress.get(key);
    const target = dayTarget(habit, row);
    const amount = row?.amount ?? 0;
    return { ...base, t: 'q', d: amount >= target ? 1 : 0, g: target, a: amount, u: (row?.unit_snapshot || habit.unit || '').trim() };
  }
  return { ...base, t: 'b', d: proof.completions.has(key) ? 1 : 0 };
}

/**
 * Eligibility matches the Habits page's "due" list (active and scheduled that day). A
 * reconstruction additionally requires the habit to have existed (created on or before the day):
 * a currently active habit is never assumed to have existed in the past.
 */
export function eligibleOn(habit: Habit, day: string, reconstructing: boolean) {
  if (!scheduled(habit, day)) return false;
  if (!reconstructing) return true;
  const created = localDayOf(habit.created_at);
  return !!created && created <= day;
}

export function summarize(items: HistoryItem[]) {
  const eligible = items.length;
  const completed = items.reduce((sum, item) => sum + item.d, 0);
  return { eligible, completed, percent: eligible ? completed / eligible * 100 : 0 };
}

const ordered = (habits: Habit[]) => [...habits].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || b.created_at.localeCompare(a.created_at));

/** Computes a day's snapshot from the habit definitions in force on that day. */
export function computeDay(habits: Habit[], day: string, proof: Evidence, reconstructing = false) {
  const items = ordered(habits).filter(habit => eligibleOn(habit, day, reconstructing)).map(habit => itemFor(habit, day, proof));
  return { items, ...summarize(items) };
}

/**
 * An explicit progress edit for a frozen day: updates only habits that were eligible that day,
 * keeping their historical name and target. A habit not in the snapshot stays out of the denominator.
 */
export function patchItems(items: HistoryItem[], habitId: string, day: string, proof: Evidence): HistoryItem[] {
  const key = `${habitId}:${day}`;
  return items.map(item => {
    if (item.h !== habitId) return item;
    if (item.t === 'q') {
      const row = proof.progress.get(key);
      const target = row?.target_snapshot && row.target_snapshot > 0 ? row.target_snapshot : item.g ?? 1;
      const amount = row?.amount ?? 0;
      return { ...item, a: amount, g: target, d: amount >= target ? 1 : 0 };
    }
    return { ...item, d: proof.completions.has(key) ? 1 : 0 };
  });
}

/** Defensive JSON parse: a damaged row shows as unavailable detail rather than crashing History. */
export function parseItems(raw: string | null | undefined): HistoryItem[] | null {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return null;
    return value.filter((item): item is HistoryItem => !!item && typeof item === 'object' && typeof (item as HistoryItem).h === 'string' && typeof (item as HistoryItem).n === 'string' && ((item as HistoryItem).d === 0 || (item as HistoryItem).d === 1));
  } catch { return null; }
}

/** First day a reconstruction may cover: the earliest day any current habit both existed and was scheduled. */
export function reconstructionStart(habits: Habit[], today: string) {
  let first: string | null = null;
  for (const habit of habits) {
    const created = localDayOf(habit.created_at);
    if (!created) continue;
    const start = habit.start_date > created ? habit.start_date : created;
    if (!first || start < first) first = start;
  }
  if (!first) return null;
  const floor = addDays(today, -RECONSTRUCT_MAX_DAYS);
  return first < floor ? floor : first;
}

// ---------------------------------------------------------------------------
// Display: four completion shades plus neutral states.

export type CellState = 'future' | 'unavailable' | 'none' | 0 | 1 | 2 | 3;

/** 0% → 0; 1–33% → 1; 34–67% → 2; 68–100% → 3 (on the rounded label, so 1/3 and 2/3 match their labels). */
export function shadeLevel(percent: number): 0 | 1 | 2 | 3 {
  if (!(percent > 0)) return 0;
  const shown = Math.round(percent);
  return shown <= 33 ? 1 : shown <= 67 ? 2 : 3;
}

export function cellState(day: string, today: string, row: Pick<HistoryDay, 'eligible' | 'percent'> | undefined): CellState {
  if (day > today) return 'future';
  if (!row) return 'unavailable';
  if (!row.eligible) return 'none';
  return shadeLevel(row.percent);
}

/** "67%" — the stored value keeps full precision; only the label rounds. Never shows 100% unless all were done. */
export function percentLabel(row: Pick<HistoryDay, 'eligible' | 'completed' | 'percent'>) {
  if (!row.eligible) return '–';
  if (row.completed < row.eligible && Math.round(row.percent) === 100) return '99%';
  if (row.completed > 0 && Math.round(row.percent) === 0) return '1%';
  return `${Math.round(row.percent)}%`;
}

// ---------------------------------------------------------------------------
// Calendar geometry (local calendar keys, Monday first like the rest of Volt).

export const monthKey = (day: string) => day.slice(0, 7);
export const firstOfMonth = (year: number, month: number) => dayKey(new Date(year, month, 1, 12));
export const lastOfMonth = (year: number, month: number) => dayKey(new Date(year, month + 1, 0, 12));
export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number);
  return monthKey(firstOfMonth(y, m - 1 + delta));
}

/** Monday-first weeks; `null` pads days outside the month. 4, 5 or 6 rows depending on the month. */
/** Calendar rows for a month; `weekStartsOn` 1 = Monday (default), 0 = Sunday (History calendar). */
export function monthWeeks(month: string, weekStartsOn: 0 | 1 = 1): (string | null)[][] {
  const [y, m] = month.split('-').map(Number);
  const first = firstOfMonth(y, m - 1), last = lastOfMonth(y, m - 1);
  const lead = (fromDay(first).getDay() + 7 - weekStartsOn) % 7;
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let day = first; day <= last; day = addDays(day, 1)) cells.push(day);
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  return weeks;
}

export const yearMonths = (year: number) => Array.from({ length: 12 }, (_, index) => monthKey(firstOfMonth(year, index)));

// ---------------------------------------------------------------------------
// Free / Pro access. Pro is the verified RevenueCat entitlement, never a stored flag.

export type HistoryAccess = { canBrowseMonth: (month: string) => boolean; canOpenYear: boolean; canShare: boolean; canSeeDetail: (day: string) => boolean };
export function historyAccess(isPro: boolean, today: string): HistoryAccess {
  const current = monthKey(today);
  return {
    canBrowseMonth: month => month <= current && (isPro || month === current),
    canOpenYear: isPro,
    canShare: isPro,
    // Product rule: individual habit results only for the current calendar month, for everyone.
    canSeeDetail: day => monthKey(day) === current && day <= today,
  };
}
