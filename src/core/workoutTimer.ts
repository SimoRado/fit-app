import type { Workout, WorkoutSessionStatus } from './types';

export type WorkoutTimerState = {
  session_status: WorkoutSessionStatus;
  elapsed_seconds: number;
  running_since_ms: number | null;
  paused_since_ms: number | null;
  paused_seconds: number;
  finished_at_ms: number | null;
};

const validTimestamp = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const wholeSeconds = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
const sinceSeconds = (since: number | null, now: number) => validTimestamp(since) && validTimestamp(now) ? Math.max(0, Math.floor((now - since) / 1000)) : 0;

export function startWorkoutTimer(now: number): WorkoutTimerState {
  const timestamp = validTimestamp(now) ? now : Date.now();
  return { session_status: 'running', elapsed_seconds: 0, running_since_ms: timestamp, paused_since_ms: null, paused_seconds: 0, finished_at_ms: null };
}

export function elapsedWorkoutSeconds(state: Partial<WorkoutTimerState>, now: number): number {
  const base = wholeSeconds(state.elapsed_seconds);
  return state.session_status === 'running' ? base + sinceSeconds(state.running_since_ms ?? null, now) : base;
}

export function pauseWorkoutTimer(state: WorkoutTimerState, now: number): WorkoutTimerState {
  if (state.session_status !== 'running') return state;
  const timestamp = validTimestamp(now) ? now : (validTimestamp(state.running_since_ms) ? state.running_since_ms : 0);
  return { ...state, session_status: 'paused', elapsed_seconds: elapsedWorkoutSeconds(state, timestamp), running_since_ms: null, paused_since_ms: timestamp };
}

export function resumeWorkoutTimer(state: WorkoutTimerState, now: number): WorkoutTimerState {
  if (state.session_status !== 'paused') return state;
  const timestamp = validTimestamp(now) ? now : (validTimestamp(state.paused_since_ms) ? state.paused_since_ms : 0);
  return {
    ...state,
    session_status: 'running',
    running_since_ms: timestamp,
    paused_since_ms: null,
    paused_seconds: wholeSeconds(state.paused_seconds) + sinceSeconds(state.paused_since_ms ?? null, timestamp),
  };
}

export function finishWorkoutTimer(state: WorkoutTimerState, now: number): WorkoutTimerState {
  if (state.session_status === 'completed') return state;
  const timestamp = validTimestamp(now) ? now : (validTimestamp(state.running_since_ms) ? state.running_since_ms : validTimestamp(state.paused_since_ms) ? state.paused_since_ms : 0);
  const elapsed = elapsedWorkoutSeconds(state, timestamp);
  const pausedNow = state.session_status === 'paused' ? sinceSeconds(state.paused_since_ms ?? null, timestamp) : 0;
  return {
    ...state,
    session_status: 'completed',
    elapsed_seconds: elapsed,
    running_since_ms: null,
    paused_since_ms: null,
    paused_seconds: wholeSeconds(state.paused_seconds) + pausedNow,
    finished_at_ms: timestamp,
  };
}

export function workoutTimerFromRecord(workout: Workout): WorkoutTimerState {
  return {
    session_status: workout.session_status ?? (workout.completed ? 'completed' : 'draft'),
    elapsed_seconds: wholeSeconds(workout.elapsed_seconds),
    running_since_ms: validTimestamp(workout.running_since_ms) ? workout.running_since_ms : null,
    paused_since_ms: validTimestamp(workout.paused_since_ms) ? workout.paused_since_ms : null,
    paused_seconds: wholeSeconds(workout.paused_seconds),
    finished_at_ms: validTimestamp(workout.finished_at_ms) ? workout.finished_at_ms : null,
  };
}

export function formatWorkoutElapsed(seconds: number): string {
  const total = wholeSeconds(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}
