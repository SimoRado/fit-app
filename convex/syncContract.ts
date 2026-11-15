export const kinds = ['profile','exercises','habits','habit_completions','habit_progress','missions','mission_completions','routines','routine_exercises','workouts','workout_exercises','workout_sets','weights','measurements','rest_days','favorites','preferences','nutrition_preferences','nutrition_targets','custom_foods','food_entries'] as const;
export type Kind = typeof kinds[number];

// Match the columns produced by SQLite SELECT * for every synchronized table.
export const syncRecordFields: Record<Kind, readonly string[]> = {
  profile: ['id','name','birth_date','height_cm','start_weight','target_weight','experience','fitness_goal','growth_goals','language','completed_at'],
  exercises: ['id','name','metric','custom'],
  habits: ['id','owner_id','name','description','category','icon','frequency','days','weekly_target','start_date','archived','reminder_time','created_at','habit_type','target_value','unit','increment','reminder_enabled','reminder_times','sort_order'],
  habit_completions: ['id','habit_id','day','created_at'],
  habit_progress: ['id','habit_id','day','amount','target_snapshot','unit_snapshot','updated_at'],
  missions: ['id','owner_id','title','type','target','period','active','created_at'],
  mission_completions: ['id','mission_id','day'],
  routines: ['id','owner_id','name','created_at'],
  routine_exercises: ['id','routine_id','exercise_id','position'],
  workouts: ['id','owner_id','name','day','started_at','duration_min','notes','completed','created_at','session_status','elapsed_seconds','running_since_ms','paused_since_ms','paused_seconds','finished_at_ms'],
  workout_exercises: ['id','workout_id','exercise_id','position'],
  workout_sets: ['id','workout_exercise_id','set_number','reps','weight_kg','duration_sec','note','completed'],
  weights: ['id','owner_id','day','kg','note','created_at'],
  measurements: ['id','owner_id','day','type','value','unit'],
  rest_days: ['owner_id','day'],
  favorites: ['card_id','owner_id'],
  preferences: ['key','value'],
  nutrition_preferences: ['owner_id','enabled'],
  nutrition_targets: ['id','owner_id','effective_day','kcal','protein','carbs','fat','created_at'],
  custom_foods: ['id','owner_id','name','kcal_100','protein_100','carbs_100','fat_100','created_at'],
  food_entries: ['id','owner_id','food_id','day','meal','name','grams','kcal','protein','carbs','fat','kcal_100','protein_100','carbs_100','fat_100','created_at','catalog_food_id'],
};
