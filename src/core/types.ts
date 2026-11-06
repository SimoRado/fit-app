export type Language = 'en' | 'fr' | 'ar';
export type Profile = { id: string; name: string; birth_date: string; height_cm: number; start_weight: number; target_weight: number | null; experience: string; fitness_goal: string; growth_goals: string; language: Language; completed_at: string };
export type Habit = { id: string; owner_id: string; name: string; description: string; category: string; icon: string; frequency: 'daily' | 'days' | 'quota'; days: string; weekly_target: number; start_date: string; archived: number; reminder_time: string | null; created_at: string };
export type HabitCompletion = { id: string; habit_id: string; day: string; created_at: string };
export type Mission = { id: string; owner_id: string; title: string; type: 'manual' | 'habits' | 'workouts' | 'weight'; target: number; period: 'daily' | 'weekly'; active: number; created_at: string };
export type MissionCompletion = { id: string; mission_id: string; day: string };
export type WeightEntry = { id: string; owner_id: string; day: string; kg: number; note: string; created_at: string };
export type Measurement = { id: string; owner_id: string; day: string; type: string; value: number; unit: string };
export type Exercise = { id: string; name: string; metric: 'weight_reps' | 'reps' | 'duration'; custom: number };
export type WorkoutSessionStatus = 'draft' | 'running' | 'paused' | 'completed';
export type Workout = {
  id: string; owner_id: string; name: string; day: string; started_at: string; duration_min: number | null; notes: string; completed: number; created_at: string;
  /** Added by the workout-session migration. Optional for older fixtures and cloud payloads. */
  session_status?: WorkoutSessionStatus;
  elapsed_seconds?: number;
  running_since_ms?: number | null;
  paused_since_ms?: number | null;
  paused_seconds?: number;
  finished_at_ms?: number | null;
};
export type WorkoutExercise = { id: string; workout_id: string; exercise_id: string; position: number };
export type WorkoutSet = { id: string; workout_exercise_id: string; set_number: number; reps: number | null; weight_kg: number | null; duration_sec: number | null; note: string; completed: number };
export type Routine = { id: string; owner_id: string; name: string; created_at: string };
export type RoutineExercise = { id: string; routine_id: string; exercise_id: string; position: number };
export type Favorite = { card_id: string; owner_id: string };
export type Preference = { key: string; value: string };
export type NotificationSchedule = { key: string; notification_id: string; config: string };
