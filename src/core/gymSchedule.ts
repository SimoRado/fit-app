export type GymDayPlan =
  | { weekday: number; kind: 'routine'; routineId: string }
  | { weekday: number; kind: 'rest' };

export const gymSchedulePreferenceKey = 'training.weekly-plan.v1';

function validWeekday(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 6;
}

/** Parses persisted schedule data defensively; malformed or stale entries never block training. */
export function parseGymSchedule(value: string | null | undefined): GymDayPlan[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    const byDay = new Map<number, GymDayPlan>();
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const row = item as { weekday?: unknown; kind?: unknown; routineId?: unknown };
      if (!validWeekday(row.weekday)) continue;
      if (row.kind === 'rest') byDay.set(row.weekday, { weekday: row.weekday, kind: 'rest' });
      if (row.kind === 'routine' && typeof row.routineId === 'string' && row.routineId.trim()) {
        byDay.set(row.weekday, { weekday: row.weekday, kind: 'routine', routineId: row.routineId });
      }
    }
    return [...byDay.values()].sort((a, b) => a.weekday - b.weekday);
  } catch {
    return [];
  }
}

export function serializeGymSchedule(plan: readonly GymDayPlan[]) {
  return JSON.stringify([...plan].sort((a, b) => a.weekday - b.weekday));
}

export function planForWeekday(plan: readonly GymDayPlan[], weekday: number) {
  return plan.find(item => item.weekday === weekday) ?? null;
}

/** Replaces one weekday or clears it without creating duplicate weekday entries. */
export function setGymDayPlan(plan: readonly GymDayPlan[], weekday: number, next: GymDayPlan | null): GymDayPlan[] {
  if (!validWeekday(weekday)) return [...plan];
  const withoutDay = plan.filter(item => item.weekday !== weekday);
  return next ? [...withoutDay, { ...next, weekday }].sort((a, b) => a.weekday - b.weekday) : withoutDay;
}

// ---------------------------------------------------------------------------
// One-date exceptions to the weekly plan ("This day only"). A one-off rest day keeps using the
// existing `rest_days` table; a one-off routine, or "no plan this date" (e.g. skipping a weekly
// rest day once), is stored here. Both live in the synced `preferences` table, so no schema change.

export const gymOverridesPreferenceKey = 'training.day-overrides.v1';
export type GymOverrideValue = { kind: 'routine'; routineId: string } | { kind: 'none' };
export type GymDayOverride = GymOverrideValue & { day: string };
const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Exceptions older than this are dropped when the map is saved (history colours never need them). */
export const OVERRIDE_RETENTION_DAYS = 800;

export function parseGymOverrides(value: string | null | undefined): Map<string, GymDayOverride> {
  const out = new Map<string, GymDayOverride>();
  if (!value) return out;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return out;
    for (const item of parsed) {
      const row = item as { day?: unknown; kind?: unknown; routineId?: unknown } | null;
      if (!row || typeof row.day !== 'string' || !DAY.test(row.day)) continue;
      if (row.kind === 'none') out.set(row.day, { day: row.day, kind: 'none' });
      else if (row.kind === 'routine' && typeof row.routineId === 'string' && row.routineId.trim()) out.set(row.day, { day: row.day, kind: 'routine', routineId: row.routineId });
    }
  } catch { /* A damaged value never blocks training; it reads as "no exceptions". */ }
  return out;
}

export function serializeGymOverrides(overrides: ReadonlyMap<string, GymDayOverride>, oldest?: string) {
  return JSON.stringify([...overrides.values()].filter(item => !oldest || item.day >= oldest).sort((a, b) => a.day.localeCompare(b.day)));
}

/** Sets or clears one date's exception without touching any other date. */
export function setGymOverride(overrides: ReadonlyMap<string, GymDayOverride>, day: string, next: GymOverrideValue | null): Map<string, GymDayOverride> {
  const copy = new Map(overrides);
  if (!DAY.test(day)) return copy;
  if (next) copy.set(day, { ...next, day } as GymDayOverride); else copy.delete(day);
  return copy;
}

/** What the user picked for one date in "This day only" mode. */
export type GymDayChoice = { kind: 'routine'; routineId: string } | { kind: 'rest' } | { kind: 'none' };

/**
 * Minimal storage for a one-date choice: when it matches the weekly plan the date's exceptions are
 * simply cleared; otherwise a one-off rest day (`rest_days`) or a date exception is stored. Never
 * touches the weekly plan or any other date.
 */
export function planDayChange(weekly: readonly GymDayPlan[], day: string, choice: GymDayChoice): { rest: boolean; override: GymOverrideValue | null } {
  const entry = planForWeekday(weekly, new Date(`${day}T12:00:00`).getDay());
  if (choice.kind === 'rest') return { rest: entry?.kind !== 'rest', override: null };
  if (choice.kind === 'routine') return { rest: false, override: entry?.kind === 'routine' && entry.routineId === choice.routineId ? null : { kind: 'routine', routineId: choice.routineId } };
  return { rest: false, override: entry ? { kind: 'none' } : null };
}

// ---------------------------------------------------------------------------
// Weekly plan history. Changing the weekly plan applies from today on; the plan that was in force
// before is remembered so earlier days (e.g. past weekly rest days) keep their status.

export const gymPlanHistoryPreferenceKey = 'training.weekly-plan.history.v1';
/** `plan` was in force for every day before `until`. */
export type GymPlanEra = { until: string; plan: GymDayPlan[] };
const MAX_ERAS = 120;

export function parseGymPlanHistory(value: string | null | undefined): GymPlanEra[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is { until: string; plan: unknown } => !!item && typeof item === 'object' && typeof (item as { until?: unknown }).until === 'string' && DAY.test((item as { until: string }).until))
      .map(item => ({ until: item.until, plan: parseGymSchedule(JSON.stringify(item.plan)) }))
      .sort((a, b) => a.until.localeCompare(b.until));
  } catch { return []; }
}

/** Records the plan that was in force before a change made on `today`. Several changes on one day keep the first. */
export function recordGymPlanChange(history: readonly GymPlanEra[], previous: readonly GymDayPlan[], today: string): GymPlanEra[] {
  if (history.some(era => era.until >= today)) return [...history];
  return [...history, { until: today, plan: [...previous] }].slice(-MAX_ERAS);
}

/** The weekly plan that applied on `day`: the era covering it, else the current plan. */
export function planInForce(history: readonly GymPlanEra[], current: readonly GymDayPlan[], day: string): readonly GymDayPlan[] {
  for (const era of history) if (day < era.until) return era.plan;
  return current;
}

export type ResolvedDayPlan = { kind: 'routine'; routineId: string; oneOff?: boolean } | { kind: 'rest'; oneOff: boolean } | null;

/**
 * What is planned on a specific date. Precedence (first match wins):
 *   1. a one-off rest day for that date (`rest_days`);
 *   2. a one-date exception: a routine for that date, or "no plan" (cancels the weekly entry once);
 *   3. the weekly plan for that weekday.
 * Entries that point at a deleted routine resolve to "no plan" instead of breaking.
 * A completed workout is not a plan: calendars show it above any of these (see workoutCalendar).
 */
export function resolveDayPlan(plan: readonly GymDayPlan[], day: string, restDays: readonly string[] | ReadonlySet<string>, routineIds: ReadonlySet<string>, overrides?: ReadonlyMap<string, GymDayOverride>): ResolvedDayPlan {
  if (Array.isArray(restDays) ? restDays.includes(day) : (restDays as ReadonlySet<string>).has(day)) return { kind: 'rest', oneOff: true };
  const exception = overrides?.get(day);
  if (exception) return exception.kind === 'routine' && routineIds.has(exception.routineId) ? { kind: 'routine', routineId: exception.routineId, oneOff: true } : null;
  const weekday = new Date(`${day}T12:00:00`).getDay();
  const entry = planForWeekday(plan, weekday);
  if (!entry) return null;
  if (entry.kind === 'rest') return { kind: 'rest', oneOff: false };
  return routineIds.has(entry.routineId) ? { kind: 'routine', routineId: entry.routineId } : null;
}

/** Returns a new order and leaves the draft unchanged when either position is invalid. */
export function moveInList<T>(items: readonly T[], from: number, to: number): T[] {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) return [...items];
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
