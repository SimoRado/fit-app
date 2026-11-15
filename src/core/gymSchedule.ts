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

export type ResolvedDayPlan = { kind: 'routine'; routineId: string } | { kind: 'rest'; oneOff: boolean } | null;

/**
 * What is planned on a specific date: a one-off rest day wins, then the weekly plan.
 * Weekly entries that point at a deleted routine resolve to "no plan" instead of breaking.
 */
export function resolveDayPlan(plan: readonly GymDayPlan[], day: string, restDays: readonly string[], routineIds: ReadonlySet<string>): ResolvedDayPlan {
  if (restDays.includes(day)) return { kind: 'rest', oneOff: true };
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
