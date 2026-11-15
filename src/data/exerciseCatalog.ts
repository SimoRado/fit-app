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

/** Instruction languages stored on the device (the app's UI languages); others stay in the bundle only. */
export const storedInstructionLanguages = ['en', 'fr', 'ar'] as const;
const pickLanguages = <T>(values: Record<string, T>) => Object.fromEntries(storedInstructionLanguages.filter(code => code in values).map(code => [code, values[code]]));
/** Rows per multi-row INSERT and per transaction. 13 bound values × 100 rows stays far below SQLite's variable limit. */
export const CATALOG_IMPORT_BATCH = 100;
const catalogColumns = 'exercise_id,source_id,category,body_part,equipment,equipment_key,muscle_group,muscle_group_key,target_muscle,secondary_muscles,instructions,instruction_steps,search_text,media_uri';

/**
 * Imports the bundled text catalog once per catalog version.
 * Rows are written with multi-row statements in small transactions (about 40 native calls instead of
 * ~4,000), so the import is fast and other writes can interleave between batches. Upserts make a
 * partially completed import safe to resume; the version marker is written last.
 */
export async function importExerciseCatalog(database: SQLite.SQLiteDatabase) {
  const prior = await database.getFirstAsync<{ version: string }>('SELECT version FROM exercise_catalog_imports WHERE source=?', 'hasaneyldrm/exercises-dataset');
  if (prior?.version === catalogVersion) return;
  const catalog = (await import('./catalog/exercises.json')).default as CatalogRow[];
  const aliases = (await import('./catalog/source-aliases.json')).default as { source_id: string; canonical_source_id: string }[];
  for (let start = 0; start < catalog.length; start += CATALOG_IMPORT_BATCH) {
    const batch = catalog.slice(start, start + CATALOG_IMPORT_BATCH);
    const exerciseValues: (string | null)[] = [];
    const catalogValues: (string | null)[] = [];
    const sourceValues: string[] = [];
    for (const row of batch) {
      const id = fitExerciseId(row.source_id, row.name);
      exerciseValues.push(id, row.name, 'weight_reps');
      catalogValues.push(id, row.source_id, row.category, row.body_part, row.equipment, normalizeEquipment(row.equipment), row.muscle_group, normalizeMuscle(row.muscle_group), row.target_muscle,
        JSON.stringify(row.secondary_muscles), JSON.stringify(pickLanguages(row.instructions)), JSON.stringify(pickLanguages(row.instruction_steps)), searchText(row));
      sourceValues.push(row.source_id, id);
    }
    const rows = (width: number) => batch.map(() => `(${Array.from({ length: width }, () => '?').join(',')})`).join(',');
    await database.withExclusiveTransactionAsync(async tx => {
      await tx.runAsync(`INSERT OR IGNORE INTO exercises (id,name,metric,custom) VALUES ${batch.map(() => '(?,?,?,0)').join(',')}`, ...exerciseValues);
      await tx.runAsync(`INSERT INTO exercise_catalog (${catalogColumns}) VALUES ${batch.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)').join(',')}
        ON CONFLICT(source_id) DO UPDATE SET category=excluded.category,body_part=excluded.body_part,equipment=excluded.equipment,equipment_key=excluded.equipment_key,muscle_group=excluded.muscle_group,muscle_group_key=excluded.muscle_group_key,target_muscle=excluded.target_muscle,secondary_muscles=excluded.secondary_muscles,instructions=excluded.instructions,instruction_steps=excluded.instruction_steps,search_text=excluded.search_text`, ...catalogValues);
      await tx.runAsync(`INSERT INTO exercise_catalog_sources (source_id,exercise_id) VALUES ${rows(2)} ON CONFLICT(source_id) DO UPDATE SET exercise_id=excluded.exercise_id`, ...sourceValues);
    });
  }
  await database.withExclusiveTransactionAsync(async tx => {
    for (const alias of aliases) await tx.runAsync('INSERT INTO exercise_catalog_sources (source_id,exercise_id) VALUES (?,?) ON CONFLICT(source_id) DO UPDATE SET exercise_id=excluded.exercise_id', alias.source_id, fitExerciseId(alias.canonical_source_id, catalog.find(row => row.source_id === alias.canonical_source_id)!.name));
    await tx.runAsync('INSERT INTO exercise_catalog_imports (source,version) VALUES (?,?) ON CONFLICT(source) DO UPDATE SET version=excluded.version', 'hasaneyldrm/exercises-dataset', catalogVersion);
  });
}
