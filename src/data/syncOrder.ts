import { syncTables } from './syncSchema';

export type SyncKind = typeof syncTables[number]['name'];
export type OutboxRow = { kind: SyncKind; record_id: string; action: 'upsert' | 'delete'; operation_id: string; conflict: number };
export type CloudRow = { kind: string; clientId: string; payload: string | null; revision: number; deleted: boolean };
export const upsertOrder: SyncKind[] = ['profile','exercises','habits','missions','routines','workouts','weights','measurements','rest_days','favorites','preferences','nutrition_preferences','nutrition_targets','custom_foods','food_entries','habit_completions','mission_completions','routine_exercises','workout_exercises','workout_sets'];
export function orderOutbox(rows: OutboxRow[]) {
  return [...rows].sort((a, b) => (a.action === 'delete' ? 1 : 0) - (b.action === 'delete' ? 1 : 0) ||
    (a.action === 'delete' ? -1 : 1) * (upsertOrder.indexOf(a.kind) - upsertOrder.indexOf(b.kind)));
}
