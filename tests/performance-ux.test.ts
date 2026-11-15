import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { describe, expect, it } from 'vitest';
import catalogRows from '../src/data/catalog/exercises.json';
import { exerciseSeeds, migrations } from '../src/data/schema';
import { CATALOG_IMPORT_BATCH, exerciseSearchQuery, importExerciseCatalog, normalizeExerciseText, storedInstructionLanguages } from '../src/data/exerciseCatalog';
import { saveRoutineDraft } from '../src/data/routineStore';
import { addExercise, emptyRoutineDraft, updateTargetSet } from '../src/core/routineDraft';
import { storageErrorMessage } from '../src/core/errors';
import { datePartLength, daysInMonth, isLeapYear, isoFromParts, padDatePart, parsePastedDate, splitIsoDate, typeDatePart, validateDateParts } from '../src/core/dateInput';
import { clampDay, daySelectable, moveSelectionByWeek, startOfWeek, weekDays, weekNavigation, weekRangeLabel } from '../src/core/weekCalendar';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

/** Real migrations in node:sqlite behind an expo-sqlite shaped adapter that counts writes. */
function database(sql = new DatabaseSync(':memory:'), fresh = true) {
  if (fresh) {
    sql.exec('PRAGMA foreign_keys=ON');
    migrations.forEach(migration => sql.exec(migration));
    for (const [id, name] of exerciseSeeds) sql.prepare('INSERT INTO exercises VALUES (?,?,?,0)').run(id, name, id === 'pullup' ? 'reps' : 'weight_reps');
    sql.prepare('INSERT INTO profile VALUES (?,?,?,?,?,?,?,?,?,?,?)').run('owner', 'Alex', '1990-01-01', 175, 80, null, 'Beginner', 'Fitness', '', 'en', 'now');
  }
  const counters = { writes: 0, transactions: 0 };
  let failOn: RegExp | null = null;
  const api = {
    runAsync: async (query: string, ...args: unknown[]) => {
      counters.writes++;
      if (failOn?.test(query)) throw Error('database is locked');
      return sql.prepare(query).run(...args as []);
    },
    getFirstAsync: async <T>(query: string, ...args: unknown[]) => (sql.prepare(query).get(...args as []) ?? null) as T | null,
    getAllAsync: async <T>(query: string, ...args: unknown[]) => sql.prepare(query).all(...args as []) as T[],
  };
  const adapter = {
    ...api,
    withExclusiveTransactionAsync: async (callback: (tx: typeof api) => Promise<void>) => {
      counters.transactions++;
      sql.exec('BEGIN');
      try { await callback(api); sql.exec('COMMIT'); } catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  } as unknown as SQLiteDatabase;
  return { sql, adapter, counters, failNext: (pattern: RegExp | null) => { failOn = pattern; } };
}
const count = (sql: DatabaseSync, table: string) => (sql.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;

describe('routine saving', () => {
  const draft = () => updateTargetSet(addExercise(addExercise({ ...emptyRoutineDraft(), name: 'Push' }, 'bench'), 'shoulder'), '', 0, {});

  it('saves successfully and atomically', async () => {
    const { sql, adapter } = database();
    await saveRoutineDraft(adapter, 'owner', draft());
    expect(count(sql, 'routines')).toBe(1);
    expect(count(sql, 'routine_exercises')).toBe(2);
    expect(count(sql, 'preferences')).toBe(1);
  });

  it('rolls back completely when a write fails and explains the failure', async () => {
    const { sql, adapter, failNext } = database();
    failNext(/INSERT OR REPLACE INTO preferences/);
    const attempt = saveRoutineDraft(adapter, 'owner', draft());
    await expect(attempt).rejects.toThrow('database is locked');
    expect(count(sql, 'routines')).toBe(0);
    expect(count(sql, 'routine_exercises')).toBe(0);
    expect(storageErrorMessage(Error('database is locked'))).toBe('Cubyfit was busy saving other data. Please try again.');
    // The same draft saves on retry.
    failNext(null);
    await saveRoutineDraft(adapter, 'owner', draft());
    expect(count(sql, 'routines')).toBe(1);
  });

  it('rejects oversized planned sets before writing anything (no silent truncation)', async () => {
    const { sql, adapter, counters } = database();
    let big = { ...emptyRoutineDraft(), name: 'Huge' };
    for (let i = 0; i < 40; i++) big = addExercise(big, `catalog:${String(i).padStart(4, '0')}`, { sets: 10 });
    await expect(saveRoutineDraft(adapter, 'owner', big)).rejects.toThrow(/too many planned sets/);
    expect(counters.writes).toBe(0);
    expect(count(sql, 'routines')).toBe(0);
  });

  it('guards against double taps and stale text from removed sets', () => {
    const form = source('src/app/routine-form.tsx');
    expect(form).toContain('if (savingRef.current) return;');
    expect(form).toContain('if (!liveKeys.has(key)) continue;');
    expect(form).toContain("{ text: localize('Try again', language), onPress: () => { void save(); } }");
    expect(form.indexOf('await repo.saveRoutineDraft')).toBeLessThan(form.indexOf('setLeaving(true)', form.indexOf('await repo.saveRoutineDraft')));
    const button = source('src/ui/components.tsx');
    expect(button).toContain('if (disabled || pendingRef.current) return;');
    expect(button).toContain('.finally(() => { pendingRef.current = false; setPending(false); })');
    expect(source('src/ui/ExerciseBrowser.tsx')).toContain('if (now - lastPick.current < 700) return;');
  });
});

describe('exercise library initialization', () => {
  it('imports offline from the bundled module in a few batched statements', async () => {
    const { sql, adapter, counters } = database();
    await importExerciseCatalog(adapter);
    expect(count(sql, 'exercise_catalog')).toBe(1321);
    const batches = Math.ceil(1321 / CATALOG_IMPORT_BATCH);
    expect(counters.transactions).toBe(batches + 1);
    expect(counters.writes).toBeLessThanOrEqual(batches * 3 + 10);
    const stored = JSON.parse((sql.prepare('SELECT instruction_steps FROM exercise_catalog LIMIT 1').get() as { instruction_steps: string }).instruction_steps) as Record<string, unknown>;
    expect(Object.keys(stored).every(code => (storedInstructionLanguages as readonly string[]).includes(code))).toBe(true);
    expect(stored.en).toBeTruthy();
    const module = source('src/data/exerciseCatalog.ts');
    expect(module).toContain("await import('./catalog/exercises.json')");
    expect(module).not.toMatch(/fetch\(|https?:\/\//);
    expect(catalogRows).toHaveLength(1321);
  });

  it('skips re-import after a restart and still searches with filters', async () => {
    const first = database();
    await importExerciseCatalog(first.adapter);
    const restarted = database(first.sql, false);
    await importExerciseCatalog(restarted.adapter);
    expect(restarted.counters.writes).toBe(0);
    const term = normalizeExerciseText('bench');
    const rows = first.sql.prepare(exerciseSearchQuery).all(term, term, '', '', '', '', '', '', 60) as { name: string }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(row => row.name.toLowerCase().includes('bench'))).toBe(true);
    const none = first.sql.prepare(exerciseSearchQuery).all('zzzz-not-an-exercise', 'zzzz-not-an-exercise', '', '', '', '', '', '', 60);
    expect(none).toEqual([]);
  });

  it('resumes safely after an interrupted import', async () => {
    const { sql, adapter, failNext } = database();
    failNext(/exercise_catalog_imports/);
    await expect(importExerciseCatalog(adapter)).rejects.toThrow();
    failNext(null);
    await importExerciseCatalog(adapter);
    expect(count(sql, 'exercise_catalog')).toBe(1321);
    expect(count(sql, 'exercise_catalog_imports')).toBe(1);
  });

  it('never blocks the database on the catalog and recovers in the picker', () => {
    const db = source('src/data/db.ts');
    const open = db.slice(db.indexOf('export async function db()'), db.indexOf('// Exercise catalog: imported once'));
    expect(open).not.toContain('await importExerciseCatalog');
    expect(open).toContain('scheduleCatalogImport(requestedAccount)');
    const picker = source('src/ui/ExerciseBrowser.tsx');
    expect(picker).toContain("'The exercise library is taking longer than expected.'");
    expect(picker).toContain('ensureExerciseCatalog().catch(() => undefined).finally(() => setAttempt(value => value + 1))');
  });

  it('keeps bundled release assets static and avoids JavaScript hashing of the bundled food archive', () => {
    const food = source('src/data/foodCatalog.ts');
    expect(food).toContain("require('../../assets/foods-full-v4.sqlite.gz')");
    expect(food).toContain("require('../../assets/foods-starter-v4.db')");
    const verify = food.slice(food.indexOf('async function verifiedBundledFull'), food.indexOf('async function installBundledFullCatalog'));
    expect(verify).not.toContain('hashFile');
    expect(verify).toContain('validate(file, full.food_count, true)');
    expect(food).toContain('await yieldToUi();');
    expect(food).toContain('scheduleBundledUpgrade()');
  });
});

describe('storage concurrency and responsiveness', () => {
  it('uses WAL, a busy timeout and a serialized writer', () => {
    const db = source('src/data/db.ts');
    expect(db).toContain("PRAGMA journal_mode = WAL");
    expect(db).toContain('PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}');
    expect(db).toContain("await tx.execAsync('BEGIN IMMEDIATE')");
    expect(db).toContain('d.withExclusiveTransactionAsync = task => serializedTransaction(writer, task');
  });
  it('reloads hidden tabs only when focused and debounces sync after changes', () => {
    for (const route of ['index', 'workouts', 'nutrition', 'habits', 'progress']) expect(source(`src/app/(tabs)/${route}.tsx`)).toContain('const revision = useScreenRevision();');
    expect(source('src/state/sync.tsx')).toContain('const kick = setTimeout(() => { void run(); }, 1500);');
  });
  it('keeps the per-second workout timer out of the exercise list', () => {
    const workout = source('src/app/workout-form.tsx');
    expect(workout).toContain('function LiveTimer(');
    expect(workout).not.toMatch(/setInterval\(\(\) => setNow\(currentTimestamp\(\)\), 1000\);\n    return \(\) => clearInterval\(tick\);\n  \}, \[ready/);
    expect(source('src/ui/SetRow.tsx')).toContain('export const SetRow = React.memo(SetRowView');
  });
});

describe('Day / Month / Year date input', () => {
  it('auto-advances at the maximum length and pads unambiguous single digits', () => {
    expect(datePartLength).toEqual({ day: 2, month: 2, year: 4 });
    expect(typeDatePart('day', '1')).toEqual({ value: '1', complete: false });
    expect(typeDatePart('day', '12')).toEqual({ value: '12', complete: true });
    expect(typeDatePart('day', '5')).toEqual({ value: '05', complete: true });
    expect(typeDatePart('month', '1')).toEqual({ value: '1', complete: false });
    expect(typeDatePart('month', '3')).toEqual({ value: '03', complete: true });
    expect(typeDatePart('year', '199')).toEqual({ value: '199', complete: false });
    expect(typeDatePart('year', '19905')).toEqual({ value: '1990', complete: true });
    expect(typeDatePart('day', '1a')).toEqual({ value: '1', complete: false });
    expect(padDatePart('day', '7')).toBe('07');
    expect(padDatePart('year', '7')).toBe('7');
  });

  it('parses pasted dates in day-first and ISO forms', () => {
    expect(parsePastedDate('29/02/2024')).toEqual({ day: '29', month: '02', year: '2024' });
    expect(parsePastedDate('1.3.2025')).toEqual({ day: '01', month: '03', year: '2025' });
    expect(parsePastedDate('2004-02-29')).toEqual({ day: '29', month: '02', year: '2004' });
    expect(parsePastedDate('31122023')).toEqual({ day: '31', month: '12', year: '2023' });
    expect(parsePastedDate('20040229')).toEqual({ day: '29', month: '02', year: '2004' });
    expect(parsePastedDate('hello')).toBeNull();
  });

  it('validates real dates, leap years and feature limits while storing YYYY-MM-DD', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(daysInMonth(2023, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(validateDateParts({ day: '29', month: '02', year: '2024' })).toBeNull();
    expect(validateDateParts({ day: '29', month: '02', year: '2023' })).toBe('2023 is not a leap year.');
    expect(validateDateParts({ day: '31', month: '04', year: '2026' })).toBe('This month has 30 days.');
    expect(validateDateParts({ day: '10', month: '13', year: '2026' })).toBe('Month must be between 01 and 12.');
    expect(validateDateParts({ day: '', month: '1', year: '2026' })).toBe('Enter the day, month and year.');
    expect(validateDateParts({ day: '15', month: '11', year: '2026' }, { max: '2026-11-14', maxMessage: 'No future dates.' })).toBe('No future dates.');
    expect(splitIsoDate('1995-01-02')).toEqual({ day: '02', month: '01', year: '1995' });
    expect(isoFromParts({ day: '2', month: '1', year: '1995' })).toBe('1995-01-02');
  });

  it('is used for every manual date field', () => {
    expect(source('src/ui/BirthDateField.tsx')).toContain('<DateField');
    for (const path of ['src/app/habit-form.tsx', 'src/app/measurement-form.tsx', 'src/app/weight-form.tsx', 'src/app/workout-form.tsx']) {
      const text = source(path);
      expect(text).toContain('<DateField');
      expect(text).not.toContain('(YYYY-MM-DD)"');
    }
    // Food logging inherits the Nutrition calendar's selected date.
    expect(source('src/ui/NutritionSheets.tsx')).not.toContain('<DateField');
  });
});

describe('week calendar', () => {
  it('builds local weeks across month, year and daylight-saving boundaries', () => {
    expect(weekDays('2026-11-14', 1)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
    expect(weekDays('2026-11-14', 0)[0]).toBe('2026-11-08');
    expect(weekDays('2026-01-01', 1)).toEqual(['2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']);
    // European and US DST changes (late March / early November) keep seven consecutive days.
    for (const day of ['2026-03-29', '2026-10-25', '2026-03-08', '2026-11-01']) {
      const days = weekDays(day, 1);
      expect(new Set(days).size).toBe(7);
      expect(days).toContain(day);
      expect(startOfWeek(day, 1)).toBe(days[0]);
    }
    expect(weekRangeLabel('2026-11-14', 'en-US', 1, '2026-11-14')).toBe('9 – Nov 15');
    expect(weekRangeLabel('2026-01-01', 'en-US', 1, '2026-01-01')).toContain('2025');
  });

  it('Train: today and future only; navigates forward and back to the current week but not earlier', () => {
    const today = '2026-11-14';
    const rules = { minDay: today, startsOn: 1 as const };
    expect(weekNavigation(today, rules)).toEqual({ canPrevious: false, canNext: true });
    expect(daySelectable('2026-11-13', rules)).toBe(false);
    expect(daySelectable(today, rules)).toBe(true);
    expect(daySelectable('2027-01-04', rules)).toBe(true);
    const next = moveSelectionByWeek(today, 1, rules);
    expect(next).toBe('2026-11-21');
    expect(moveSelectionByWeek(next, -1, rules)).toBe(today);
    expect(moveSelectionByWeek(today, -1, rules)).toBe(today);
    expect(moveSelectionByWeek('2026-11-16', -1, rules)).toBe(today);
  });

  it('Nutrition: past days and weeks allowed, no future days or weeks, quick clamp to today', () => {
    const today = '2026-11-14';
    const rules = { maxDay: today, startsOn: 1 as const };
    expect(weekNavigation(today, rules)).toEqual({ canPrevious: true, canNext: false });
    expect(daySelectable('2026-11-13', rules)).toBe(true);
    expect(daySelectable('2026-11-15', rules)).toBe(false);
    expect(moveSelectionByWeek(today, -1, rules)).toBe('2026-11-07');
    expect(moveSelectionByWeek('2026-11-07', 1, rules)).toBe(today);
    expect(clampDay('2026-11-20', rules)).toBe(today);
  });

  it('is wired into Train and Nutrition with the right rules, and meals save under the selected day', () => {
    const train = source('src/app/(tabs)/workouts.tsx');
    expect(train).toContain('<WeekCalendar');
    expect(train).toContain('rules={{ minDay: today, startsOn: 1 }}');
    const nutrition = source('src/app/(tabs)/nutrition.tsx');
    expect(nutrition).toContain('<WeekCalendar selected={selected}');
    expect(nutrition).toContain('maxDay: today');
    expect(nutrition).toContain('day={selected}');
    const sheet = source('src/ui/NutritionSheets.tsx');
    expect(sheet).toContain("if (day > dayKey()) throw Error('Meals can be logged for today or earlier.');");
  });

  it('uses theme tokens for the new controls', () => {
    for (const path of ['src/ui/WeekCalendar.tsx', 'src/ui/DateField.tsx']) {
      const text = source(path);
      expect(text).toContain('usePalette()');
      expect(text).not.toMatch(/#[0-9A-Fa-f]{6}\b/);
    }
  });
});

describe('unrelated features stay untouched', () => {
  it('does not change subscription or advertising logic', () => {
    const ads = source('src/services/adMob.ts');
    expect(ads).toContain('Constants.expoConfig?.extra?.admob?.internalBuild === true');
    expect(source('src/state/subscriptions.tsx')).not.toContain('voltKit');
  });
});
