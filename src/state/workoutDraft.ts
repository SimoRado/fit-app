import { Workout, WorkoutSessionStatus } from '../core/types';

export type DraftSet = { id: string; reps: string; weight: string; duration: string; note: string; completed: boolean };
export type DraftExercise = { id: string; exerciseId: string; sets: DraftSet[] };
export type WorkoutDraft = {
  original: Workout | null;
  name: string;
  day: string;
  start: string;
  duration: string;
  notes: string;
  completed: boolean;
  items: DraftExercise[];
  sessionStatus: WorkoutSessionStatus;
  elapsedSeconds: number;
  runningSinceMs: number | null;
  pausedSinceMs: number | null;
  pausedSeconds: number;
  finishedAtMs: number | null;
};
