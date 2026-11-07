export const syncTables = [
  { name: 'profile', key: "NEW.id", oldKey: "OLD.id" },
  { name: 'exercises', key: "NEW.id", oldKey: "OLD.id", whenNew: 'NEW.custom=1', whenOld: 'OLD.custom=1' },
  { name: 'habits', key: "NEW.id", oldKey: "OLD.id" },
  { name: 'habit_completions', key: "NEW.habit_id||':'||NEW.day", oldKey: "OLD.habit_id||':'||OLD.day" },
  { name: 'missions', key: "NEW.id", oldKey: "OLD.id" },
  { name: 'mission_completions', key: "NEW.mission_id||':'||NEW.day", oldKey: "OLD.mission_id||':'||OLD.day" },
  { name: 'routines', key: "NEW.id", oldKey: "OLD.id" },
  { name: 'routine_exercises', key: "NEW.id", oldKey: "OLD.id" },
  { name: 'workouts', key: "NEW.id", oldKey: "OLD.id" },
  { name: 'workout_exercises', key: "NEW.id", oldKey: "OLD.id" },
  { name: 'workout_sets', key: "NEW.id", oldKey: "OLD.id" },
  { name: 'weights', key: "NEW.id", oldKey: "OLD.id" },
  { name: 'measurements', key: "NEW.id", oldKey: "OLD.id" },
  { name: 'rest_days', key: "NEW.owner_id||':'||NEW.day", oldKey: "OLD.owner_id||':'||OLD.day" },
  { name: 'favorites', key: "NEW.owner_id||':'||NEW.card_id", oldKey: "OLD.owner_id||':'||OLD.card_id" },
  { name: 'preferences', key: "NEW.key", oldKey: "OLD.key" },
  { name: 'nutrition_preferences', key: "NEW.owner_id", oldKey: "OLD.owner_id" },
  { name: 'nutrition_targets', key: "NEW.id", oldKey: "OLD.id" },
  { name: 'custom_foods', key: "NEW.id", oldKey: "OLD.id" },
  { name: 'food_entries', key: "NEW.id", oldKey: "OLD.id" },
  { name: 'habit_progress', key: "NEW.habit_id||':'||NEW.day", oldKey: "OLD.habit_id||':'||OLD.day" },
] as const;

const queue = (table: string, key: string, action: string) => `INSERT INTO sync_outbox(kind,record_id,action,operation_id) VALUES ('${table}',${key},'${action}',lower(hex(randomblob(16)))) ON CONFLICT(kind,record_id) DO UPDATE SET action=excluded.action,operation_id=excluded.operation_id,conflict=0;`;
export const nutritionSyncTables = syncTables.slice(-5, -1);
export const habitProgressSyncTables = syncTables.slice(-1);
export const syncTriggers = (tables: readonly (typeof syncTables[number])[]) => tables.flatMap(t => ['INSERT','UPDATE','DELETE'].map(event => {
  const isDelete = event === 'DELETE';
  const condition = isDelete ? ('whenOld' in t ? t.whenOld : '1') : ('whenNew' in t ? t.whenNew : '1');
  return `CREATE TRIGGER IF NOT EXISTS sync_${t.name}_${event.toLowerCase()} AFTER ${event} ON ${t.name} WHEN (SELECT choice FROM sync_control WHERE id=1)='enabled' AND ${condition} BEGIN ${queue(t.name, isDelete ? t.oldKey : t.key, isDelete ? 'delete' : 'upsert')} END;`;
})).join('\n');
export const syncMigration = `
CREATE TABLE IF NOT EXISTS sync_control (id INTEGER PRIMARY KEY CHECK(id=1), choice TEXT NOT NULL CHECK(choice IN ('ask','local','enabled','applying')));
INSERT OR IGNORE INTO sync_control VALUES (1,'ask');
CREATE TABLE IF NOT EXISTS sync_outbox (kind TEXT NOT NULL, record_id TEXT NOT NULL, action TEXT NOT NULL CHECK(action IN ('upsert','delete')), operation_id TEXT NOT NULL, conflict INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(kind,record_id));
CREATE TABLE IF NOT EXISTS sync_versions (kind TEXT NOT NULL, record_id TEXT NOT NULL, revision INTEGER NOT NULL, PRIMARY KEY(kind,record_id));
${syncTriggers(syncTables.slice(0, -5))}
`;
