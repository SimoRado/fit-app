import { nutritionSyncTables, syncMigration, syncTriggers } from './syncSchema';

export const migrations = [
  `CREATE TABLE IF NOT EXISTS profile (id TEXT PRIMARY KEY, name TEXT NOT NULL, birth_date TEXT NOT NULL, height_cm REAL NOT NULL, start_weight REAL NOT NULL, target_weight REAL, experience TEXT NOT NULL, fitness_goal TEXT NOT NULL, growth_goals TEXT NOT NULL, language TEXT NOT NULL, completed_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS habits (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE, name TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, icon TEXT NOT NULL, frequency TEXT NOT NULL, days TEXT NOT NULL, weekly_target INTEGER NOT NULL, start_date TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, reminder_time TEXT, created_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS habit_completions (id TEXT PRIMARY KEY, habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE, day TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(habit_id,day));
   CREATE TABLE IF NOT EXISTS missions (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE, title TEXT NOT NULL, type TEXT NOT NULL, target INTEGER NOT NULL, period TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS mission_completions (id TEXT PRIMARY KEY, mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE, day TEXT NOT NULL, UNIQUE(mission_id,day));
   CREATE TABLE IF NOT EXISTS weights (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE, day TEXT NOT NULL, kg REAL NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS measurements (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE, day TEXT NOT NULL, type TEXT NOT NULL, value REAL NOT NULL, unit TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS exercises (id TEXT PRIMARY KEY, name TEXT NOT NULL, metric TEXT NOT NULL, custom INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS workouts (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE, name TEXT NOT NULL, day TEXT NOT NULL, started_at TEXT NOT NULL, duration_min INTEGER, notes TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS workout_exercises (id TEXT PRIMARY KEY, workout_id TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE, exercise_id TEXT NOT NULL REFERENCES exercises(id), position INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS workout_sets (id TEXT PRIMARY KEY, workout_exercise_id TEXT NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE, set_number INTEGER NOT NULL, reps INTEGER, weight_kg REAL, duration_sec INTEGER, note TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS routines (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE, name TEXT NOT NULL, created_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS routine_exercises (id TEXT PRIMARY KEY, routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE, exercise_id TEXT NOT NULL REFERENCES exercises(id), position INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS rest_days (owner_id TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE, day TEXT NOT NULL, PRIMARY KEY(owner_id,day));
   CREATE TABLE IF NOT EXISTS favorites (card_id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE, PRIMARY KEY(card_id,owner_id));
   CREATE TABLE IF NOT EXISTS preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS notification_schedules (key TEXT PRIMARY KEY, notification_id TEXT NOT NULL);`,
  `ALTER TABLE notification_schedules ADD COLUMN config TEXT NOT NULL DEFAULT '';`,
  `ALTER TABLE workout_sets ADD COLUMN completed INTEGER NOT NULL DEFAULT 1;`,
  syncMigration,
  `CREATE TABLE IF NOT EXISTS nutrition_preferences (owner_id TEXT PRIMARY KEY REFERENCES profile(id) ON DELETE CASCADE, enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)));
   CREATE TABLE IF NOT EXISTS nutrition_targets (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE, effective_day TEXT NOT NULL, kcal REAL NOT NULL CHECK(kcal>0 AND kcal<=10000), protein REAL NOT NULL CHECK(protein>=0 AND protein<=2000), carbs REAL NOT NULL CHECK(carbs>=0 AND carbs<=2000), fat REAL NOT NULL CHECK(fat>=0 AND fat<=2000), created_at TEXT NOT NULL);
   CREATE UNIQUE INDEX IF NOT EXISTS nutrition_targets_day ON nutrition_targets(owner_id,effective_day);
   CREATE TABLE IF NOT EXISTS custom_foods (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE, name TEXT NOT NULL, kcal_100 REAL NOT NULL CHECK(kcal_100>=0 AND kcal_100<=10000), protein_100 REAL NOT NULL CHECK(protein_100>=0 AND protein_100<=2000), carbs_100 REAL NOT NULL CHECK(carbs_100>=0 AND carbs_100<=2000), fat_100 REAL NOT NULL CHECK(fat_100>=0 AND fat_100<=2000), created_at TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS custom_foods_name ON custom_foods(owner_id,name);
   CREATE TABLE IF NOT EXISTS food_entries (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE, food_id TEXT REFERENCES custom_foods(id) ON DELETE SET NULL, day TEXT NOT NULL, meal TEXT NOT NULL CHECK(meal IN ('breakfast','lunch','dinner','snacks')), name TEXT NOT NULL, grams REAL, kcal REAL NOT NULL CHECK(kcal>=0 AND kcal<=10000), protein REAL NOT NULL CHECK(protein>=0 AND protein<=2000), carbs REAL NOT NULL CHECK(carbs>=0 AND carbs<=2000), fat REAL NOT NULL CHECK(fat>=0 AND fat<=2000), kcal_100 REAL, protein_100 REAL, carbs_100 REAL, fat_100 REAL, created_at TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS food_entries_day ON food_entries(owner_id,day);
   ${syncTriggers(nutritionSyncTables)}`,
  `ALTER TABLE workouts ADD COLUMN session_status TEXT NOT NULL DEFAULT 'draft' CHECK(session_status IN ('draft','running','paused','completed'));
   ALTER TABLE workouts ADD COLUMN elapsed_seconds INTEGER NOT NULL DEFAULT 0 CHECK(elapsed_seconds>=0);
   ALTER TABLE workouts ADD COLUMN running_since_ms INTEGER;
   ALTER TABLE workouts ADD COLUMN paused_since_ms INTEGER;
   ALTER TABLE workouts ADD COLUMN paused_seconds INTEGER NOT NULL DEFAULT 0 CHECK(paused_seconds>=0);
   ALTER TABLE workouts ADD COLUMN finished_at_ms INTEGER;
   UPDATE workouts SET session_status='completed', elapsed_seconds=max(0,COALESCE(duration_min,0))*60 WHERE completed=1;
   CREATE UNIQUE INDEX IF NOT EXISTS one_open_workout_per_owner ON workouts(owner_id) WHERE session_status IN ('running','paused');`,
] as const;

export const exerciseSeeds: readonly [string, string][] = [
  ['bench', 'Bench Press'], ['squat', 'Squat'], ['deadlift', 'Deadlift'],
  ['shoulder', 'Shoulder Press'], ['curl', 'Biceps Curl'], ['pullup', 'Pull-Up'],
  ['lat', 'Lat Pulldown'], ['legpress', 'Leg Press'], ['plank', 'Plank'], ['running', 'Running'],
];
