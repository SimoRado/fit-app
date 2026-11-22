import { planInForce, resolveDayPlan, type GymDayOverride, type GymDayPlan, type GymPlanEra, type ResolvedDayPlan } from './gymSchedule';
import type { Workout } from './types';

/**
 * Workouts calendar adapter. Reads only data the Train screen already holds (completed training
 * workouts, one-off rest days, one-date exceptions, the weekly plan and its history), so a month or
 * a whole year is computed in memory with no per-day query.
 *
 * Status priority (deterministic, first match wins):
 *   1. `done`    — at least one completed training workout on that local day (any routine, also on
 *                  a planned rest day). Drafts and in-progress sessions never count: the source is
 *                  `trainingWorkoutsQuery` (completed=1 with at least one real completed set).
 *   2. `rest`    — the resolved plan is rest (one-off date, or the weekly plan in force that day).
 *   3. `planned` — today or later, with a routine planned (one-date exception or weekly plan).
 *   4. `pending` — today with nothing done or planned yet (never "missed" while the day is running).
 *   5. `missed`  — an earlier day with no completed workout and no rest.
 *   6. `open`    — a future day with nothing planned.
 * Past days use the weekly plan that was in force then (`planInForce`), so changing or removing a
 * weekly rest day never rewrites earlier days. Both workout and rest records are always kept.
 */
export type WorkoutDayKind = 'done' | 'rest' | 'planned' | 'pending' | 'missed' | 'open';
export type WorkoutDay = { day: string; kind: WorkoutDayKind; workouts: number; plan: ResolvedDayPlan };

export type WorkoutCalendarData = {
  completed: ReadonlyMap<string, number>; rest: ReadonlySet<string>; plan: readonly GymDayPlan[]; routineIds: ReadonlySet<string>;
  overrides: ReadonlyMap<string, GymDayOverride>; history: readonly GymPlanEra[];
};

/** One pass over the workouts: completed sessions per local day (a session belongs to the day it started). */
export function workoutCalendarData(training: readonly Pick<Workout, 'day' | 'completed'>[], restDays: readonly string[], plan: readonly GymDayPlan[], routineIds: ReadonlySet<string>,
  overrides: ReadonlyMap<string, GymDayOverride> = new Map(), history: readonly GymPlanEra[] = []): WorkoutCalendarData {
  const completed = new Map<string, number>();
  for (const workout of training) if (workout.completed) completed.set(workout.day, (completed.get(workout.day) ?? 0) + 1);
  return { completed, rest: new Set(restDays), plan, routineIds, overrides, history };
}

export function workoutDayStatus(day: string, today: string, data: WorkoutCalendarData): WorkoutDay {
  const workouts = data.completed.get(day) ?? 0;
  const weekly = day < today ? planInForce(data.history, data.plan, day) : data.plan;
  const plan = resolveDayPlan(weekly, day, data.rest, data.routineIds, data.overrides);
  const kind: WorkoutDayKind = workouts > 0 ? 'done'
    : plan?.kind === 'rest' ? 'rest'
    : day < today ? 'missed'
    : plan?.kind === 'routine' ? 'planned'
    : day === today ? 'pending' : 'open';
  return { day, kind, workouts, plan };
}
