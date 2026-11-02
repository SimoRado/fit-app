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
] as const;

export const exerciseSeeds: readonly [string, string][] = [
  ['bench', 'Bench Press'], ['squat', 'Squat'], ['deadlift', 'Deadlift'],
  ['shoulder', 'Shoulder Press'], ['curl', 'Biceps Curl'], ['pullup', 'Pull-Up'],
  ['lat', 'Lat Pulldown'], ['legpress', 'Leg Press'], ['plank', 'Plank'], ['running', 'Running'],
];
