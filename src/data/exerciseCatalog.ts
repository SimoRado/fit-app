import type * as SQLite from 'expo-sqlite';
import version from './catalog/version.json';

type CatalogRow = {
  source_id: string; name: string; category: string; body_part: string;
  equipment: string; muscle_group: string; target_muscle: string;
  secondary_muscles: string[]; instructions: Record<string, string>;
  instruction_steps: Record<string, string[]>;
};

export type ExerciseDetail = {
  exercise_id: string; source_id: string; category: string; body_part: string;
  equipment: string; equipment_key: string; muscle_group: string; muscle_group_key: string; target_muscle: string;
  secondary_muscles: string; instructions: string; instruction_steps: string;
  search_text: string; media_uri: string | null;
};

const muscleAliases: Record<string, string> = {
  'abdominals': 'core', 'abs': 'core', 'latissimus dorsi': 'lats',
  'trapezius': 'traps', 'deltoids': 'shoulders',
};
const equipmentAliases: Record<string, string> = {
  'body weight': 'bodyweight', 'resistance band': 'band',
  'ez barbell': 'ez bar',
};
export const normalizeExerciseText = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
export const normalizeMuscle = (value: string) => muscleAliases[normalizeExerciseText(value)] ?? normalizeExerciseText(value);
export const normalizeEquipment = (value: string) => equipmentAliases[normalizeExerciseText(value)] ?? normalizeExerciseText(value);

const seedNames = new Map<string, string>([['pull up', 'pullup']]);
export const catalogVersion = version.sha256;
export const fitExerciseId = (sourceId: string, name: string) => seedNames.get(normalizeExerciseText(name)) ?? `catalog:${sourceId}`;
export const searchText = (row: CatalogRow) => [row.name, row.category, row.body_part, row.equipment, normalizeEquipment(row.equipment), row.muscle_group, normalizeMuscle(row.muscle_group), row.target_muscle, ...row.secondary_muscles].map(normalizeExerciseText).join(' ');
export const exerciseSearchQuery = `SELECT e.*, c.muscle_group, c.equipment, c.category FROM exercises e LEFT JOIN exercise_catalog c ON c.exercise_id=e.id
  WHERE (?='' OR instr(COALESCE(c.search_text, lower(e.name)), ?) > 0)
  AND (?='' OR c.muscle_group_key=?) AND (?='' OR c.equipment_key=?) AND (?='' OR c.category=?)
  ORDER BY e.custom DESC, e.name LIMIT ?`;

export async function importExerciseCatalog(database: SQLite.SQLiteDatabase) {
  const prior = await database.getFirstAsync<{ version: string }>('SELECT version FROM exercise_catalog_imports WHERE source=?', 'hasaneyldrm/exercises-dataset');
  if (prior?.version === catalogVersion) return;
  const catalog = (await import('./catalog/exercises.json')).default as CatalogRow[];
  const aliases = (await import('./catalog/source-aliases.json')).default as { source_id: string; canonical_source_id: string }[];
  await database.withExclusiveTransactionAsync(async tx => {
    for (const row of catalog) {
      const id = fitExerciseId(row.source_id, row.name);
      await tx.runAsync('INSERT OR IGNORE INTO exercises (id,name,metric,custom) VALUES (?,?,?,0)', id, row.name, 'weight_reps');
      await tx.runAsync(`INSERT INTO exercise_catalog (exercise_id,source_id,category,body_part,equipment,equipment_key,muscle_group,muscle_group_key,target_muscle,secondary_muscles,instructions,instruction_steps,search_text,media_uri)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)
        ON CONFLICT(source_id) DO UPDATE SET category=excluded.category,body_part=excluded.body_part,equipment=excluded.equipment,equipment_key=excluded.equipment_key,muscle_group=excluded.muscle_group,muscle_group_key=excluded.muscle_group_key,target_muscle=excluded.target_muscle,secondary_muscles=excluded.secondary_muscles,instructions=excluded.instructions,instruction_steps=excluded.instruction_steps,search_text=excluded.search_text`,
        id, row.source_id, row.category, row.body_part, row.equipment, normalizeEquipment(row.equipment), row.muscle_group, normalizeMuscle(row.muscle_group), row.target_muscle, JSON.stringify(row.secondary_muscles), JSON.stringify(row.instructions), JSON.stringify(row.instruction_steps), searchText(row));
      await tx.runAsync('INSERT INTO exercise_catalog_sources (source_id,exercise_id) VALUES (?,?) ON CONFLICT(source_id) DO UPDATE SET exercise_id=excluded.exercise_id', row.source_id, id);
    }
    for (const alias of aliases) await tx.runAsync('INSERT INTO exercise_catalog_sources (source_id,exercise_id) VALUES (?,?) ON CONFLICT(source_id) DO UPDATE SET exercise_id=excluded.exercise_id', alias.source_id, fitExerciseId(alias.canonical_source_id, catalog.find(row => row.source_id === alias.canonical_source_id)!.name));
    await tx.runAsync('INSERT INTO exercise_catalog_imports (source,version) VALUES (?,?) ON CONFLICT(source) DO UPDATE SET version=excluded.version', 'hasaneyldrm/exercises-dataset', catalogVersion);
  });
}
