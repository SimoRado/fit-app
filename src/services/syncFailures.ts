import type { OutboxRow, SyncKind } from '../data/syncOrder';

export type FailureCategory = 'validation' | 'dependency' | 'auth' | 'network' | 'temporary';

export function classifySyncFailure(cause: unknown): FailureCategory {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (/network|fetch|connection|offline|timeout|websocket/i.test(message)) return 'network';
  if (/Authentication required|Account deletion in progress|Unauthenticated/i.test(message)) return 'auth';
  if (/Parent record is not synchronized|Custom food is not synchronized|Exercise is not synchronized/i.test(message)) return 'dependency';
  if (/Invalid (record|sync|catalog|portion|food|habit|weight|profile|language|calorie|target|nutrition|workout)|Record too large|Only custom exercises|Record ID mismatch|Operation ID reused/i.test(message)) return 'validation';
  return 'temporary';
}

export function retryDelayMs(attempts: number) {
  return Math.min(300_000, 5_000 * 2 ** Math.min(6, Math.max(0, attempts - 1)));
}

const parents: Partial<Record<SyncKind, SyncKind[]>> = {
  habits: ['profile'], habit_completions: ['habits'], habit_progress: ['habits'], habit_days: ['profile'],
  missions: ['profile'], mission_completions: ['missions'], routines: ['profile'],
  routine_exercises: ['routines', 'exercises'], workouts: ['profile'],
  workout_exercises: ['workouts', 'exercises'], workout_sets: ['workout_exercises'],
  weights: ['profile'], measurements: ['profile'], rest_days: ['profile'],
  favorites: ['profile'], nutrition_preferences: ['profile'], nutrition_targets: ['profile'],
  custom_foods: ['profile'], food_entries: ['profile', 'custom_foods'],
};

function dependsOn(kind: SyncKind, parent: SyncKind, seen = new Set<SyncKind>()): boolean {
  if (seen.has(kind)) return false;
  seen.add(kind);
  return (parents[kind] ?? []).some(next => next === parent || dependsOn(next, parent, seen));
}

// Conservative table-level barriers preserve parent/child ordering when a deleted
// child has no local payload from which to recover its parent ID.
export function orderedBehindFailure(op: OutboxRow, failed: OutboxRow) {
  if (op.action === 'upsert' && failed.action === 'upsert') return dependsOn(op.kind, failed.kind);
  if (op.action === 'delete' && failed.action === 'delete') return dependsOn(failed.kind, op.kind);
  return false;
}
