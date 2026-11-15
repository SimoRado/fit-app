import type { Habit, HabitCompletion, HabitProgress } from './types';

/**
 * Accumulative ("measured") habit maths, shared by SQLite writes, the
 * optimistic UI state and tests. The stored amount is exact; only the visual
 * ratio is clamped to 0–1. Completion = amount ≥ the day's target.
 */

/** Adds `delta` (may be negative) without float drift (0.1 + 0.2) and never below zero. */
export function nextAmount(current: number, delta: number) {
  const value = Math.round((current + delta) * 10000) / 10000;
  return value > 0 ? value : 0;
}

/** Target for a day: the day's snapshot when one exists, else the habit's current target. */
export const dayTarget = (habit: Pick<Habit, 'target_value'>, row?: Pick<HabitProgress, 'target_snapshot'>) =>
  row?.target_snapshot && row.target_snapshot > 0 ? row.target_snapshot : habit.target_value && habit.target_value > 0 ? habit.target_value : 1;

export const quantityDone = (habit: Pick<Habit, 'target_value'>, row?: Pick<HabitProgress, 'amount' | 'target_snapshot'>) =>
  !!row && row.amount >= dayTarget(habit, row);

/** 0–1 progress for the ring and the segment: yes/no habits are 0 or 1, measured habits partial. */
export function habitRatio(habit: Pick<Habit, 'habit_type' | 'target_value'>, row: Pick<HabitProgress, 'amount' | 'target_snapshot'> | undefined, completed: boolean) {
  if (habit.habit_type !== 'quantity') return completed ? 1 : 0;
  if (!row) return 0;
  return Math.max(0, Math.min(1, row.amount / dayTarget(habit, row)));
}

/** "2", "0.25", "10,000" — trims float noise for display; the stored value is untouched. */
export const formatAmount = (value: number) => Number(value.toFixed(2)).toLocaleString('en-US', { maximumFractionDigits: 2 });

/** "2 / 3 L" */
export const amountLabel = (habit: Pick<Habit, 'target_value' | 'unit'>, row?: Pick<HabitProgress, 'amount' | 'target_snapshot' | 'unit_snapshot'>) =>
  `${formatAmount(row?.amount ?? 0)} / ${formatAmount(dayTarget(habit, row))} ${(row?.unit_snapshot || habit.unit || '').trim()}`.trim();

/**
 * Optimistic copy of what `repo.addHabitAmount` writes: progress row (removed
 * at 0) and the completion record (present only at/over the target).
 * Applied with functional state updates so rapid taps compound correctly.
 */
export function applyAmountDelta(progress: HabitProgress[], completions: HabitCompletion[], habit: Pick<Habit, 'id' | 'target_value' | 'unit'>, day: string, delta: number, now = new Date().toISOString()) {
  const prior = progress.find(row => row.habit_id === habit.id && row.day === day);
  const amount = nextAmount(prior?.amount ?? 0, delta);
  const target = dayTarget(habit, prior);
  const others = progress.filter(row => !(row.habit_id === habit.id && row.day === day));
  const nextProgress = amount > 0 ? [...others, { id: `${habit.id}:${day}`, habit_id: habit.id, day, amount, target_snapshot: target, unit_snapshot: prior?.unit_snapshot ?? habit.unit ?? '', updated_at: now }] : others;
  const done = amount >= target;
  const had = completions.some(row => row.habit_id === habit.id && row.day === day);
  const nextCompletions = done && !had ? [...completions, { id: `local-${habit.id}:${day}`, habit_id: habit.id, day, created_at: now }]
    : !done && had ? completions.filter(row => !(row.habit_id === habit.id && row.day === day)) : completions;
  return { progress: nextProgress, completions: nextCompletions, amount, done };
}
