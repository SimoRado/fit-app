import { Workout } from '../core/types';

export type DraftSet = { id: string; reps: string; weight: string; duration: string; note: string; completed: boolean };
export type DraftExercise = { id: string; exerciseId: string; sets: DraftSet[] };
export type WorkoutDraft = { original: Workout | null; name: string; day: string; start: string; duration: string; notes: string; completed: boolean; items: DraftExercise[]; timerStarted: number };

// Keeps an unsaved session when its route is left and reopened during this app session.
const drafts = new Map<string, WorkoutDraft>();
export const getWorkoutDraft = (key: string) => drafts.get(key);
export const setWorkoutDraft = (key: string, draft: WorkoutDraft) => { drafts.set(key, draft); };
export const clearWorkoutDraft = (key: string) => { drafts.delete(key); };
