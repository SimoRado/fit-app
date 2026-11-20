export const trainingWorkoutsQuery = `SELECT DISTINCT w.* FROM workouts w
  WHERE w.completed=1 AND EXISTS (
    SELECT 1 FROM workout_exercises e JOIN workout_sets s ON s.workout_exercise_id=e.id JOIN exercises x ON x.id=e.exercise_id
    WHERE e.workout_id=w.id AND s.completed=1
      AND ((x.metric='duration' AND COALESCE(s.duration_sec,0)>0)
        OR (x.metric='reps' AND COALESCE(s.reps,0)>0)
        OR (x.metric='weight_reps' AND COALESCE(s.reps,0)>0))
  )
  ORDER BY w.day DESC, w.created_at DESC`;

/** Exercises used by at least one routine, in the same order as the full `exercises()` list. */
export const routineExerciseListQuery = 'SELECT * FROM exercises WHERE id IN (SELECT exercise_id FROM routine_exercises) ORDER BY custom, name';

/** Exercises logged in at least one workout, in the same order as the full `exercises()` list. */
export const workoutExerciseListQuery = 'SELECT * FROM exercises WHERE id IN (SELECT exercise_id FROM workout_exercises) ORDER BY custom, name';
