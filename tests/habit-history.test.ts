import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { migrations } from '../src/data/schema';
import { historyRange, patchHistoryDay, reconcileHistory, withHistory, type Queryable } from '../src/data/habitHistory';
import { cellState, historyAccess, monthWeeks, parseItems, percentLabel, shadeLevel, shiftMonth, yearMonths } from '../src/core/habitHistory';

/** node:sqlite behind the same async surface expo-sqlite exposes to the History module. */
function open() {
  const db = new DatabaseSync(':memory:');
  for (const migration of migrations) db.exec(migration);
  db.prepare('INSERT INTO profile VALUES (?,?,?,?,?,?,?,?,?,?,?)').run('p', 'Alex', '1990-01-01', 175, 80, 75, 'Beginner', 'Health', '', 'en', '2026-11-01T08:00:00.000Z');
  const q: Queryable = {
    getAllAsync: async <T,>(sql: string, ...params: (string | number | null)[]) => db.prepare(sql).all(...params) as T[],
    getFirstAsync: async <T,>(sql: string, ...params: (string | number | null)[]) => (db.prepare(sql).get(...params) ?? null) as T | null,
    runAsync: async (sql: string, ...params: (string | number | null)[]) => db.prepare(sql).run(...params),
  };
  return { db, q };
}

type HabitInput = { id: string; name: string; created: string; start?: string; frequency?: 'daily' | 'days' | 'quota'; days?: string; type?: 'boolean' | 'quantity'; target?: number; unit?: string };
/** Local noon on `day`, as the app stores created_at (an ISO instant). */
const at = (day: string) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d, 12).toISOString(); };

function insertHabit(db: DatabaseSync, h: HabitInput) {
  db.prepare(`INSERT INTO habits (id,owner_id,name,description,category,icon,frequency,days,weekly_target,start_date,archived,reminder_time,created_at,habit_type,target_value,unit,increment,reminder_enabled,reminder_times,sort_order)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(h.id, 'p', h.name, '', 'Fitness', 'water', h.frequency ?? 'daily', h.days ?? '0,1,2,3,4,5,6', 7, h.start ?? h.created, 0, null, at(h.created), h.type ?? 'boolean', h.target ?? 1, h.unit ?? '', 1, 0, '[]', 0);
}

/** Mirrors the app: every mutation runs between two reconciliations on the day it happens. */
const createHabit = (env: ReturnType<typeof open>, today: string, h: HabitInput) => withHistory(env.q, today, async () => insertHabit(env.db, h));
const complete = (env: ReturnType<typeof open>, today: string, habitId: string, day = today) => withHistory(env.q, today, async () => {
  env.db.prepare('INSERT OR IGNORE INTO habit_completions VALUES (?,?,?,?)').run(`${habitId}-${day}`, habitId, day, at(day));
}, { habitId, day });
const setAmount = (env: ReturnType<typeof open>, today: string, habitId: string, day: string, amount: number, target: number) => withHistory(env.q, today, async () => {
  env.db.prepare('INSERT INTO habit_progress VALUES (?,?,?,?,?,?,?) ON CONFLICT(habit_id,day) DO UPDATE SET amount=excluded.amount').run(`${habitId}:${day}`, habitId, day, amount, target, 'L', at(day));
  if (amount >= target) env.db.prepare('INSERT OR IGNORE INTO habit_completions VALUES (?,?,?,?)').run(`${habitId}-${day}`, habitId, day, at(day));
  else env.db.prepare('DELETE FROM habit_completions WHERE habit_id=? AND day=?').run(habitId, day);
}, { habitId, day });
const deleteHabit = (env: ReturnType<typeof open>, today: string, id: string) => withHistory(env.q, today, async () => {
  env.db.prepare('DELETE FROM habit_progress WHERE habit_id=?').run(id);
  env.db.prepare('DELETE FROM habit_completions WHERE habit_id=?').run(id);
  env.db.prepare('DELETE FROM habits WHERE id=?').run(id);
});
const rename = (env: ReturnType<typeof open>, today: string, id: string, name: string, extra = '') => withHistory(env.q, today, async () => {
  env.db.prepare(`UPDATE habits SET name=?${extra} WHERE id=?`).run(name, id);
});
const days = async (env: ReturnType<typeof open>, from: string, to: string) => Object.fromEntries((await historyRange(env.q, from, to, true)).map(row => [row.day, row]));

const MON = '2026-11-09', TUE = '2026-11-10', WED = '2026-11-11', THU = '2026-11-12', FRI = '2026-11-13', SAT = '2026-11-14', SUN = '2026-11-15', NEXT_MON = '2026-11-16';
const WEEK = [MON, TUE, WED, THU, FRI];

describe('Habits History — historical stability (acceptance)', () => {
  it("keeps Monday–Friday at 100% after two habits are added on Saturday, then edited and deleted", async () => {
    const env = open();
    for (const id of ['water', 'read', 'exercise']) await createHabit(env, MON, { id, name: id, created: MON });
    for (const day of WEEK) for (const id of ['water', 'read', 'exercise']) await complete(env, day, id);
    expect((await days(env, MON, MON))[MON]).toMatchObject({ eligible: 3, completed: 3, percent: 100 });

    await createHabit(env, SAT, { id: 'stretch', name: 'Stretch', created: SAT });
    await createHabit(env, SAT, { id: 'journal', name: 'Journal', created: SAT });
    let history = await days(env, MON, SAT);
    for (const day of WEEK) expect(history[day], day).toMatchObject({ eligible: 3, completed: 3, percent: 100, status: 'final', source: 'tracked' });
    expect(history[SAT]).toMatchObject({ eligible: 5, completed: 0, status: 'open' });
    // Monday's detail lists only the three habits that applied on Monday.
    expect(history[MON].items!.map(item => item.h).sort()).toEqual(['exercise', 'read', 'water']);

    await rename(env, SUN, 'stretch', 'Morning stretch', ", frequency='days', days='1'");
    await deleteHabit(env, SUN, 'journal');
    await deleteHabit(env, SUN, 'read'); // even an original habit: past days keep it
    history = await days(env, MON, SUN);
    for (const day of WEEK) expect(history[day], day).toMatchObject({ eligible: 3, completed: 3, percent: 100 });
    expect(history[MON].items!.find(item => item.h === 'read')).toMatchObject({ n: 'read', d: 1 });
    expect(history[SAT]).toMatchObject({ eligible: 5, completed: 0 });
    expect(history[SUN].items!.map(item => item.h).sort()).toEqual(['exercise', 'water']);
  });

  it('does not inflate earlier days when habits are later removed (reverse case)', async () => {
    const env = open();
    for (const id of ['a', 'b', 'c', 'd']) await createHabit(env, MON, { id, name: id, created: MON });
    await complete(env, MON, 'a');
    await deleteHabit(env, TUE, 'b');
    await deleteHabit(env, TUE, 'c');
    await deleteHabit(env, TUE, 'd');
    const history = await days(env, MON, TUE);
    expect(history[MON]).toMatchObject({ eligible: 4, completed: 1, percent: 25 });
    expect(history[TUE]).toMatchObject({ eligible: 1, completed: 0 });
  });

  it('keeps renamed habits under the name they had that day', async () => {
    const env = open();
    await createHabit(env, MON, { id: 'h', name: 'Read', created: MON });
    await complete(env, MON, 'h');
    await rename(env, TUE, 'h', 'Read 20 pages');
    const history = await days(env, MON, TUE);
    expect(history[MON].items![0].n).toBe('Read');
    expect(history[TUE].items![0].n).toBe('Read 20 pages');
  });
});

describe('Habits History — finalization and reconciliation', () => {
  it('fills the days the app was closed exactly once, with no duplicates across restarts', async () => {
    const env = open();
    await createHabit(env, MON, { id: 'h', name: 'Walk', created: MON });
    await complete(env, MON, 'h');
    // App closed Tuesday–Thursday; opened Friday, then restarted twice.
    await reconcileHistory(env.q, FRI);
    await reconcileHistory(env.q, FRI);
    await reconcileHistory(env.q, FRI);
    const rows = env.db.prepare('SELECT day,status,completed,eligible FROM habit_days ORDER BY day').all() as { day: string; status: string }[];
    expect(rows.map(row => row.day)).toEqual([MON, TUE, WED, THU, FRI]);
    expect(rows.slice(0, 4).every(row => row.status === 'final')).toBe(true);
    expect(rows[4].status).toBe('open');
    expect(rows[1]).toMatchObject({ eligible: 1, completed: 0 });
  });

  it('never rewrites a final day during reconciliation, even if the clock moves backwards', async () => {
    const env = open();
    await createHabit(env, MON, { id: 'h', name: 'Walk', created: MON });
    await complete(env, MON, 'h');
    await reconcileHistory(env.q, TUE); // Monday finalized at 100%
    // Clock (or timezone) moves back to Monday; definitions change on that "Monday".
    await createHabit(env, MON, { id: 'late', name: 'Late', created: MON });
    expect((await days(env, MON, MON))[MON]).toMatchObject({ eligible: 1, completed: 1, status: 'final' });
  });

  it('updates today immediately on completion and undo (same rule as the Habits page)', async () => {
    const env = open();
    await createHabit(env, MON, { id: 'a', name: 'A', created: MON });
    await createHabit(env, MON, { id: 'b', name: 'B', created: MON });
    await complete(env, MON, 'a');
    expect((await days(env, MON, MON))[MON]).toMatchObject({ eligible: 2, completed: 1, percent: 50, status: 'open' });
    await withHistory(env.q, MON, async () => { env.db.prepare('DELETE FROM habit_completions WHERE habit_id=? AND day=?').run('a', MON); }, { habitId: 'a', day: MON });
    expect((await days(env, MON, MON))[MON]).toMatchObject({ completed: 0, percent: 0 });
  });

  it('respects schedules: days a habit is not scheduled do not count', async () => {
    const env = open();
    // Mondays only (getDay() 1).
    await createHabit(env, MON, { id: 'gym', name: 'Gym', created: MON, frequency: 'days', days: '1' });
    await reconcileHistory(env.q, WED);
    const history = await days(env, MON, WED);
    expect(history[MON]).toMatchObject({ eligible: 1 });
    expect(history[TUE]).toMatchObject({ eligible: 0, completed: 0 });
    expect(cellState(TUE, WED, history[TUE])).toBe('none');
  });
});

describe('Habits History — accumulative habits', () => {
  it('counts a measured habit only at or above its target; partial progress stays visible', async () => {
    const env = open();
    await createHabit(env, MON, { id: 'water', name: 'Water', created: MON, type: 'quantity', target: 3, unit: 'L' });
    await createHabit(env, MON, { id: 'read', name: 'Read', created: MON });
    await createHabit(env, MON, { id: 'workout', name: 'Workout', created: MON });
    await setAmount(env, MON, 'water', MON, 2, 3);
    await complete(env, MON, 'read');
    await complete(env, MON, 'workout');
    const day = (await days(env, MON, MON))[MON];
    expect(day).toMatchObject({ eligible: 3, completed: 2 });
    expect(day.percent).toBeCloseTo(66.667, 2);
    expect(percentLabel(day)).toBe('67%');
    expect(day.items!.find(item => item.h === 'water')).toMatchObject({ t: 'q', a: 2, g: 3, u: 'L', d: 0 });
  });

  it('lets an explicit progress edit patch a frozen day without changing its denominator', async () => {
    const env = open();
    await createHabit(env, MON, { id: 'water', name: 'Water', created: MON, type: 'quantity', target: 3, unit: 'L' });
    await createHabit(env, MON, { id: 'read', name: 'Read', created: MON });
    await reconcileHistory(env.q, TUE);
    await createHabit(env, TUE, { id: 'new', name: 'New', created: TUE });
    await setAmount(env, TUE, 'water', MON, 3, 3); // corrected for Monday on Tuesday
    const monday = (await days(env, MON, MON))[MON];
    expect(monday).toMatchObject({ eligible: 2, completed: 1, percent: 50, status: 'final' });
    // A habit that was not in Monday's snapshot cannot be added to it.
    expect(await patchHistoryDay(env.q, 'new', MON)).toBe(false);
  });

  it('keeps the historical target when the goal is raised later', async () => {
    const env = open();
    await createHabit(env, MON, { id: 'water', name: 'Water', created: MON, type: 'quantity', target: 2, unit: 'L' });
    await setAmount(env, MON, 'water', MON, 2, 2);
    await rename(env, TUE, 'water', 'Water', ', target_value=4');
    expect((await days(env, MON, MON))[MON]).toMatchObject({ completed: 1, percent: 100 });
    expect((await days(env, MON, MON))[MON].items![0].g).toBe(2);
  });
});

describe('Habits History — backfill of existing accounts', () => {
  it('reconstructs only from when each habit existed, labelled as reconstructed', async () => {
    const env = open();
    // Pre-History data: a habit created Wednesday with a back-dated start, and one created Friday.
    insertHabit(env.db, { id: 'old', name: 'Old', created: WED, start: MON });
    insertHabit(env.db, { id: 'newer', name: 'Newer', created: FRI });
    env.db.prepare('INSERT INTO habit_completions VALUES (?,?,?,?)').run('c1', 'old', THU, at(THU));
    await reconcileHistory(env.q, SAT);
    const history = await days(env, MON, SAT);
    expect(history[MON]).toBeUndefined(); // did not exist yet: unavailable, never a fabricated 0%
    expect(history[TUE]).toBeUndefined();
    expect(history[WED]).toMatchObject({ eligible: 1, completed: 0, source: 'reconstructed', status: 'final' });
    expect(history[THU]).toMatchObject({ eligible: 1, completed: 1, percent: 100, source: 'reconstructed' });
    expect(history[FRI]).toMatchObject({ eligible: 2, completed: 0, source: 'reconstructed' });
    expect(history[SAT]).toMatchObject({ source: 'tracked', status: 'open' });
    expect(cellState(MON, SAT, history[MON])).toBe('unavailable');
  });

  it('does nothing for an account without habits and preserves existing completions', async () => {
    const env = open();
    expect(await reconcileHistory(env.q, SUN)).toBe(0);
    expect((env.db.prepare('SELECT count(*) AS n FROM habit_days').get() as { n: number }).n).toBe(0);
    insertHabit(env.db, { id: 'h', name: 'H', created: MON });
    env.db.prepare('INSERT INTO habit_completions VALUES (?,?,?,?)').run('c1', 'h', MON, at(MON));
    await reconcileHistory(env.q, TUE);
    expect((env.db.prepare('SELECT count(*) AS n FROM habit_completions').get() as { n: number }).n).toBe(1);
  });

  it('only reconstructs once; later gaps are tracked', async () => {
    const env = open();
    insertHabit(env.db, { id: 'h', name: 'H', created: MON });
    await reconcileHistory(env.q, WED);
    await reconcileHistory(env.q, SAT);
    const sources = env.db.prepare('SELECT day,source FROM habit_days ORDER BY day').all() as { day: string; source: string }[];
    expect(sources).toEqual([
      { day: MON, source: 'reconstructed' }, { day: TUE, source: 'reconstructed' },
      { day: WED, source: 'tracked' }, { day: THU, source: 'tracked' }, { day: FRI, source: 'tracked' }, { day: SAT, source: 'tracked' },
    ]);
  });
});

describe('Habits History — storage and sync safety', () => {
  it('queues one cloud record per day only after consent and does not re-queue unchanged days', async () => {
    const env = open();
    await createHabit(env, MON, { id: 'h', name: 'H', created: MON });
    expect((env.db.prepare("SELECT count(*) AS n FROM sync_outbox WHERE kind='habit_days'").get() as { n: number }).n).toBe(0);
    env.db.exec("UPDATE sync_control SET choice='enabled' WHERE id=1");
    await complete(env, MON, 'h');
    expect((env.db.prepare("SELECT record_id FROM sync_outbox WHERE kind='habit_days'").all() as { record_id: string }[]).map(row => row.record_id)).toEqual([`p:${MON}`]);
    env.db.exec("DELETE FROM sync_outbox");
    await reconcileHistory(env.q, MON); // nothing changed
    expect((env.db.prepare("SELECT count(*) AS n FROM sync_outbox").get() as { n: number }).n).toBe(0);
  });

  it('rejects inconsistent rows at the database level', () => {
    const env = open();
    expect(() => env.db.prepare("INSERT INTO habit_days VALUES ('p:2026-11-09','p','2026-11-09','final','tracked',2,3,150,'[]','now')").run()).toThrow();
    env.db.prepare("INSERT INTO habit_days VALUES ('p:2026-11-09','p','2026-11-09','final','tracked',0,0,0,'[]','now')").run();
    expect(() => env.db.prepare("INSERT INTO habit_days VALUES ('p:x','p','2026-11-09','final','tracked',0,0,0,'[]','now')").run()).toThrow();
  });

  it('tolerates damaged item JSON', () => {
    expect(parseItems('not json')).toBeNull();
    expect(parseItems('[{"h":"a","n":"A","d":1},{"bad":true}]')).toHaveLength(1);
  });
});

describe('Habits History — shades, calendars and access', () => {
  it('maps exact percentages to four shades without losing precision', () => {
    expect([0, 0.4, 1, 33, 100 / 3, 34, 200 / 3, 67, 67.6, 68, 99, 100].map(shadeLevel)).toEqual([0, 1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 3]);
    expect(percentLabel({ eligible: 200, completed: 199, percent: 99.5 })).toBe('99%');
    expect(percentLabel({ eligible: 300, completed: 1, percent: 1 / 3 })).toBe('1%');
    expect(percentLabel({ eligible: 0, completed: 0, percent: 0 })).toBe('–');
  });

  it('distinguishes future, unavailable, no-habit and 0% days', () => {
    expect(cellState('2026-11-17', NEXT_MON, undefined)).toBe('future');
    expect(cellState(MON, NEXT_MON, undefined)).toBe('unavailable');
    expect(cellState(MON, NEXT_MON, { eligible: 0, percent: 0 })).toBe('none');
    expect(cellState(MON, NEXT_MON, { eligible: 2, percent: 0 })).toBe(0);
  });

  it('builds Monday-first months with 4, 5 or 6 rows, leap years and year boundaries', () => {
    expect(monthWeeks('2027-02')).toHaveLength(4); // 1 Feb 2027 is a Monday, 28 days
    expect(monthWeeks('2026-11')).toHaveLength(6); // starts on a Sunday
    expect(monthWeeks('2026-12')).toHaveLength(5);
    expect(monthWeeks('2028-02').flat().filter(Boolean)).toHaveLength(29);
    expect(monthWeeks('2026-11')[0].slice(0, 6).every(cell => cell === null)).toBe(true);
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(yearMonths(2026)[0]).toBe('2026-01');
    expect(yearMonths(2026)[11]).toBe('2026-12');
  });

  it('keeps monthly history available while gating only year and sharing on the verified entitlement', () => {
    const free = historyAccess(false, '2026-11-16'), pro = historyAccess(true, '2026-11-16');
    expect(free.canBrowseMonth('2026-11')).toBe(true);
    expect(free.canBrowseMonth('2026-10')).toBe(true);
    expect(free.canOpenYear || free.canShare).toBe(false);
    expect(pro.canBrowseMonth('2025-01')).toBe(true);
    expect(pro.canBrowseMonth('2026-12')).toBe(false); // never the future
    expect(pro.canOpenYear && pro.canShare).toBe(true);
    // Monthly history includes its saved details for either plan; never future days.
    for (const access of [free, pro]) {
      expect(access.canSeeDetail('2026-11-02')).toBe(true);
      expect(access.canSeeDetail('2026-10-31')).toBe(true);
      expect(access.canSeeDetail('2026-11-17')).toBe(false);
    }
    // Pro expiry hides only the Year visualization; stored monthly history stays untouched.
    expect(historyAccess(false, '2026-11-16').canBrowseMonth('2026-10')).toBe(true);
  });
});
