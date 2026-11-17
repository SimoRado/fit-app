import { addDays } from '../core/date';
import { RECONSTRUCT_MAX_DAYS, computeDay, evidence, historyId, parseItems, patchItems, reconstructionStart, summarize, type DaySource, type HistoryDay, type HistoryDayRow } from '../core/habitHistory';
import type { Habit, HabitCompletion, HabitProgress } from '../core/types';

/**
 * SQLite side of Habits History. Every function takes the caller's transaction so a habit change
 * and the snapshot work around it commit (or roll back) together.
 *
 * Invariant: before any habit definition changes, every day before today has a `final` snapshot.
 * Mutations therefore call `reconcileHistory` first (freezing the past with the definitions that
 * were actually in force), apply their change, then call it again to refresh today's open row.
 * Because no definition can change between a day ending and the next reconcile, filling days the
 * app was closed for (or finalizing yesterday's open row) from the current definitions is exact.
 */
type Bind = string | number | null;
export type Queryable = {
  getAllAsync<T>(sql: string, ...params: Bind[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, ...params: Bind[]): Promise<T | null>;
  runAsync(sql: string, ...params: Bind[]): Promise<unknown>;
};

type Plan = { day: string; status: 'open' | 'final'; source: DaySource; reconstructing: boolean };

// A final row is never rewritten by reconciliation, and an unchanged open row is not rewritten
// either (that would queue a pointless cloud upload on every tap).
const UPSERT = `INSERT INTO habit_days (id,owner_id,day,status,source,eligible,completed,percent,items,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET status=excluded.status,source=excluded.source,eligible=excluded.eligible,completed=excluded.completed,percent=excluded.percent,items=excluded.items,updated_at=excluded.updated_at
  WHERE habit_days.status='open' AND (excluded.status<>habit_days.status OR excluded.items<>habit_days.items OR excluded.eligible<>habit_days.eligible OR excluded.completed<>habit_days.completed)`;

async function ownerId(q: Queryable) {
  return (await q.getFirstAsync<{ id: string }>('SELECT id FROM profile LIMIT 1'))?.id ?? null;
}

async function loadEvidence(q: Queryable, from: string, to: string, habitId?: string) {
  const filter = habitId ? ' AND habit_id=?' : '';
  const args: Bind[] = habitId ? [from, to, habitId] : [from, to];
  const [completions, progress] = await Promise.all([
    q.getAllAsync<Pick<HabitCompletion, 'habit_id' | 'day'>>(`SELECT habit_id,day FROM habit_completions WHERE day BETWEEN ? AND ?${filter}`, ...args),
    q.getAllAsync<Pick<HabitProgress, 'habit_id' | 'day' | 'amount' | 'target_snapshot' | 'unit_snapshot'>>(`SELECT habit_id,day,amount,target_snapshot,unit_snapshot FROM habit_progress WHERE day BETWEEN ? AND ?${filter}`, ...args),
  ]);
  return evidence(completions, progress);
}

/**
 * Freezes every unfinished day before `today`, fills days the app was closed for, and refreshes
 * today's open snapshot. Idempotent; safe to call on launch, on resume and around every mutation.
 */
export async function reconcileHistory(q: Queryable, today: string, now = new Date().toISOString()) {
  const owner = await ownerId(q);
  if (!owner) return 0;
  const habits = await q.getAllAsync<Habit>('SELECT * FROM habits WHERE owner_id=?', owner);
  const bounds = await q.getFirstAsync<{ n: number; last: string | null }>('SELECT count(*) AS n, max(day) AS last FROM habit_days WHERE owner_id=?', owner);
  const yesterday = addDays(today, -1), floor = addDays(today, -RECONSTRUCT_MAX_DAYS);
  const plan: Plan[] = [];
  if (!bounds?.n) {
    // First run for this account. Nothing has ever been tracked, so earlier days can only be
    // reconstructed from saved records — and are labelled as such.
    if (!habits.length) return 0;
    const start = reconstructionStart(habits, today);
    if (start) for (let day = start; day <= yesterday; day = addDays(day, 1)) plan.push({ day, status: 'final', source: 'reconstructed', reconstructing: true });
  } else {
    const open = await q.getAllAsync<{ day: string; source: DaySource }>("SELECT day,source FROM habit_days WHERE owner_id=? AND status='open' AND day<?", owner, today);
    for (const row of open) plan.push({ day: row.day, status: 'final', source: row.source, reconstructing: row.source === 'reconstructed' });
    // Days the app was not opened: definitions cannot have changed meanwhile, so they are exact.
    const last = bounds.last!;
    let gap = addDays(last, 1);
    if (gap < floor) gap = floor;
    for (let day = gap; day <= yesterday; day = addDays(day, 1)) plan.push({ day, status: 'final', source: 'tracked', reconstructing: false });
  }
  const todayRow = await q.getFirstAsync<{ status: string }>('SELECT status FROM habit_days WHERE id=?', historyId(owner, today));
  // A final "today" only happens after the clock moved backwards; it stays frozen.
  if (todayRow?.status !== 'final') plan.push({ day: today, status: 'open', source: 'tracked', reconstructing: false });
  if (!plan.length) return 0;
  const from = plan.reduce((min, item) => item.day < min ? item.day : min, plan[0].day);
  const proof = await loadEvidence(q, from, today);
  let written = 0;
  for (const item of plan) {
    const result = computeDay(habits, item.day, proof, item.reconstructing);
    // Before tracking started there is no evidence a habit existed: leave the day unavailable.
    if (item.source === 'reconstructed' && !result.eligible && !habits.some(habit => habit.start_date <= item.day)) continue;
    const outcome = await q.runAsync(UPSERT, historyId(owner, item.day), owner, item.day, item.status, item.source, result.eligible, result.completed, result.percent, JSON.stringify(result.items), now) as { changes?: number } | undefined;
    written += outcome?.changes ?? 0;
  }
  return written;
}

/**
 * An explicit progress edit on a frozen day (for example a measured habit corrected for a past
 * day). Only habits that were in that day's snapshot change; the denominator never does.
 */
export async function patchHistoryDay(q: Queryable, habitId: string, day: string, now = new Date().toISOString()) {
  const owner = await ownerId(q);
  if (!owner) return false;
  const row = await q.getFirstAsync<HistoryDayRow>("SELECT * FROM habit_days WHERE id=? AND status='final'", historyId(owner, day));
  const items = row ? parseItems(row.items) : null;
  if (!row || !items || !items.some(item => item.h === habitId)) return false;
  const next = patchItems(items, habitId, day, await loadEvidence(q, day, day, habitId));
  const json = JSON.stringify(next);
  if (json === row.items) return false;
  const sum = summarize(next);
  await q.runAsync('UPDATE habit_days SET items=?,completed=?,percent=?,updated_at=? WHERE id=?', json, sum.completed, sum.percent, now, row.id);
  return true;
}

/** Runs `change` between the two reconciliations, then applies an explicit edit to `touched`. */
export async function withHistory<T>(q: Queryable, today: string, change: () => Promise<T>, touched?: { habitId: string; day: string }) {
  await reconcileHistory(q, today);
  const result = await change();
  await reconcileHistory(q, today);
  if (touched) await patchHistoryDay(q, touched.habitId, touched.day);
  return result;
}

/** Earliest recorded day: Pro navigation goes back to here, never further. */
export async function historyFirstDay(q: Queryable) {
  return (await q.getFirstAsync<{ first: string | null }>('SELECT min(day) AS first FROM habit_days'))?.first ?? null;
}

/** Range read for the calendars. Items are parsed only when asked for (current-month detail). */
export async function historyRange(q: Queryable, from: string, to: string, withItems: boolean): Promise<HistoryDay[]> {
  const rows = await q.getAllAsync<Omit<HistoryDayRow, 'id' | 'owner_id' | 'updated_at'>>(
    `SELECT day,status,source,eligible,completed,percent${withItems ? ',items' : ",'' AS items"} FROM habit_days WHERE day BETWEEN ? AND ? ORDER BY day`, from, to);
  return rows.map(row => ({ day: row.day, status: row.status, source: row.source, eligible: row.eligible, completed: row.completed, percent: row.percent, ...(withItems ? { items: parseItems(row.items) ?? undefined } : {}) }));
}
