import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertWeightDelete, assertWeightWrite, isTodayWeightDay, prepareTodayWeight, todaysWeightEntry, weightGoal, WeightHistoryLockedError } from '../src/core/weightPolicy';
import { chartGeometry, dailyWeights, dayOffset, monotonePath, pointsInWindow, windowStart } from '../src/core/weightChart';
import type { WeightEntry } from '../src/core/types';

// Disposable in-memory SQLite (real migrations + sync triggers) driven through the app's own db.ts.
const fixture = vi.hoisted(() => ({ raw: null as unknown }));
vi.mock('expo-sqlite', () => ({ openDatabaseAsync: async () => adapter(fixture.raw as DatabaseSync) }));
vi.mock('../src/data/exerciseCatalog', () => ({ importExerciseCatalog: vi.fn(), normalizeExerciseText: (value: string) => value, exerciseSearchQuery: '' }));
vi.mock('../src/core/monitoring', () => ({ reportFailure: vi.fn() }));
const { repo, setLocalAccount } = await import('../src/data/db');
const { migrations } = await import('../src/data/schema');

type Conn = { [key: string]: (...args: never[]) => unknown };
function adapter(raw: DatabaseSync): Conn {
  const c: Conn = {
    execAsync: async (sql: string) => { raw.exec(sql); },
    getFirstAsync: async (sql: string, ...args: (string | number | null)[]) => raw.prepare(sql).get(...args) ?? null,
    getAllAsync: async (sql: string, ...args: (string | number | null)[]) => raw.prepare(sql).all(...args),
    runAsync: async (sql: string, ...args: (string | number | null)[]) => raw.prepare(sql).run(...args),
    closeAsync: async () => undefined,
    withExclusiveTransactionAsync: async (task: (tx: Conn) => Promise<void>) => {
      raw.exec('BEGIN IMMEDIATE');
      try { await task(c); raw.exec('COMMIT'); } catch (cause) { raw.exec('ROLLBACK'); throw cause; }
    },
  };
  return c;
}

const entry = (patch: Partial<WeightEntry>): WeightEntry => ({ id: 'w', owner_id: 'p1', day: '2026-11-18', kg: 76.4, note: '', created_at: '2026-11-18T08:00:00.000Z', ...patch });
const TODAY = '2026-11-18';

describe('today-only weight rule (pure)', () => {
  it('accepts a new entry for today and an update of today’s entry', () => {
    expect(() => assertWeightWrite(entry({}), null, TODAY)).not.toThrow();
    expect(() => assertWeightWrite(entry({ kg: 76 }), entry({}), TODAY)).not.toThrow();
  });
  it('refuses to create, edit or move a historical entry', () => {
    expect(() => assertWeightWrite(entry({ day: '2026-11-17' }), null, TODAY)).toThrow(WeightHistoryLockedError);
    const past = entry({ id: 'old', day: '2026-11-17' });
    expect(() => assertWeightWrite({ ...past, kg: 70 }, past, TODAY)).toThrow(WeightHistoryLockedError);
    // Re-dating an old row to today would overwrite history under a new date.
    expect(() => assertWeightWrite({ ...past, day: TODAY }, past, TODAY)).toThrow(WeightHistoryLockedError);
  });
  it('rejects malformed dates, a broken clock and out-of-range weights', () => {
    expect(() => assertWeightWrite(entry({ day: '2026-02-30' }), null, TODAY)).toThrow();
    expect(() => assertWeightWrite(entry({ day: 'today' }), null, TODAY)).toThrow();
    expect(() => assertWeightWrite(entry({}), null, 'NaN-NaN-NaN')).toThrow(WeightHistoryLockedError);
    expect(() => assertWeightWrite(entry({ kg: 19.9 }), null, TODAY)).toThrow();
    expect(() => assertWeightWrite(entry({ kg: Number.NaN }), null, TODAY)).toThrow();
  });
  it('a future-dated row (clock moved back) is not today and stays locked', () => {
    const future = entry({ id: 'f', day: '2026-11-19' });
    expect(() => assertWeightWrite({ ...future, kg: 70 }, future, TODAY)).toThrow(WeightHistoryLockedError);
    expect(() => assertWeightDelete(future, TODAY)).toThrow(WeightHistoryLockedError);
  });
  it('only today’s entry can be deleted', () => {
    expect(() => assertWeightDelete(entry({}), TODAY)).not.toThrow();
    expect(() => assertWeightDelete(entry({ day: '2026-11-01' }), TODAY)).toThrow(WeightHistoryLockedError);
    expect(isTodayWeightDay(TODAY, TODAY)).toBe(true);
    expect(isTodayWeightDay('2026-11-17', TODAY)).toBe(false);
  });
  it('updates today’s row in place instead of duplicating it', () => {
    const rows = [entry({ id: 'yesterday', day: '2026-11-17' }), entry({ id: 'today-old', created_at: '2026-11-18T07:00:00.000Z' }), entry({ id: 'today-new', created_at: '2026-11-18T09:00:00.000Z', note: 'after run' })];
    expect(todaysWeightEntry(rows, TODAY)?.id).toBe('today-new');
    const next = prepareTodayWeight({ entries: rows, today: TODAY, kg: 75.9, ownerId: 'p1', now: 'NOW', newId: () => 'NEW' });
    expect(next).toEqual({ ...rows[2], kg: 75.9 });
    const fresh = prepareTodayWeight({ entries: [rows[0]], today: TODAY, kg: 75.9, ownerId: 'p1', now: 'NOW', newId: () => 'NEW' });
    expect(fresh).toEqual({ id: 'NEW', owner_id: 'p1', day: TODAY, kg: 75.9, note: '', created_at: 'NOW' });
  });
});

describe('goal progress (loss, gain, maintenance)', () => {
  it('weight loss: 79.2 → 76.4 toward 73.0', () => {
    expect(weightGoal(79.2, 76.4, 73)).toMatchObject({ direction: 'lose', progress: 45, toGo: 3.4, change: -2.8, reached: false, movingAway: false });
  });
  it('weight gain uses the same direction-aware formula', () => {
    expect(weightGoal(60, 63, 70)).toMatchObject({ direction: 'gain', progress: 30, toGo: 7, change: 3, reached: false });
  });
  it('reached or passed goals report 100% and nothing to go', () => {
    expect(weightGoal(80, 73, 73)).toMatchObject({ progress: 100, toGo: 0, reached: true });
    expect(weightGoal(80, 71.5, 73)).toMatchObject({ progress: 100, toGo: 0, reached: true });
    expect(weightGoal(60, 72, 70)).toMatchObject({ progress: 100, toGo: 0, reached: true });
  });
  it('moving away from the goal shows 0% instead of negative or misleading progress', () => {
    expect(weightGoal(80, 81.3, 73)).toMatchObject({ progress: 0, toGo: 8.3, movingAway: true });
    expect(weightGoal(60, 58, 70)).toMatchObject({ progress: 0, toGo: 12, movingAway: true });
  });
  it('maintenance and unset goals', () => {
    expect(weightGoal(70, 70, 70)).toMatchObject({ direction: 'maintain', progress: 100, toGo: 0, reached: true });
    expect(weightGoal(70, 71, 70)).toMatchObject({ direction: 'maintain', progress: 0, toGo: 1 });
    expect(weightGoal(70, 71, null)).toMatchObject({ progress: null, toGo: null, change: 1 });
  });
});

describe('chart data mapping', () => {
  const rows: WeightEntry[] = [
    entry({ id: 'a', day: '2026-11-10', kg: 77, created_at: 'a' }),
    entry({ id: 'b1', day: '2026-11-15', kg: 76.9, created_at: '2026-11-15T07:00' }),
    entry({ id: 'b2', day: '2026-11-15', kg: 76.5, created_at: '2026-11-15T20:00' }),
    entry({ id: 'c', day: '2026-11-18', kg: 76.4, created_at: 'c' }),
    entry({ id: 'bad', day: '2026-13-01', kg: 50, created_at: 'z' }),
  ];
  it('keeps one value per day (the newest) and drops malformed dates', () => {
    expect(dailyWeights(rows).map(p => [p.day, p.kg])).toEqual([['2026-11-10', 77], ['2026-11-15', 76.5], ['2026-11-18', 76.4]]);
  });
  it('7D / 30D / 90D windows end today and include the right days', () => {
    expect(windowStart(TODAY, 7)).toBe('2026-11-12');
    expect(windowStart(TODAY, 30)).toBe('2026-10-20');
    expect(windowStart(TODAY, 90)).toBe('2026-08-21');
    const points = dailyWeights(rows);
    expect(pointsInWindow(points, windowStart(TODAY, 7), TODAY).map(p => p.id)).toEqual(['b2', 'c']);
    expect(pointsInWindow(points, windowStart(TODAY, 30), TODAY)).toHaveLength(3);
  });
  it('places points at their real dates (gaps stay gaps)', () => {
    const points = pointsInWindow(dailyWeights(rows), windowStart(TODAY, 7), TODAY);
    const g = chartGeometry(points, windowStart(TODAY, 7), TODAY, { width: 360, height: 200, left: 0, right: 60, top: 0, bottom: 0 });
    expect(g.points).toHaveLength(2);
    expect(g.points[0].x).toBeCloseTo(3 / 6 * 300);
    expect(g.points[1].x).toBeCloseTo(300);
    expect(dayOffset('2026-03-28', '2026-03-30')).toBe(2); // across a DST change
  });
  it('the smoothed curve never leaves the recorded range', () => {
    const pts = [{ x: 0, y: 10 }, { x: 10, y: 50 }, { x: 20, y: 50 }, { x: 30, y: 0 }, { x: 40, y: 49 }];
    const numbers = monotonePath(pts).replace(/[MC]/g, ' ').trim().split(/\s+/).map(Number);
    const ys = numbers.filter((_, i) => i % 2 === 1);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(50);
  });
  it('one point and no points have valid states', () => {
    const one = chartGeometry([{ id: 'x', day: TODAY, kg: 70 }], windowStart(TODAY, 7), TODAY, { width: 300, height: 100, left: 0, right: 0, top: 0, bottom: 0 });
    expect(one.points).toHaveLength(1);
    expect(one.area).toBe('');
    expect(one.hi - one.lo).toBeGreaterThanOrEqual(1);
    const none = chartGeometry([], windowStart(TODAY, 7), TODAY, { width: 300, height: 100, left: 0, right: 0, top: 0, bottom: 0 });
    expect(none.line).toBe('');
  });
});

describe('SQLite: weigh-in writes go through the today-only rule', () => {
  let raw: DatabaseSync;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 18, 9, 30));
    raw = new DatabaseSync(':memory:');
    fixture.raw = raw;
    setLocalAccount(`user_${Math.random().toString(36).slice(2)}`);
    for (const migration of migrations) raw.exec(migration);
    raw.exec(`PRAGMA user_version = ${migrations.length}`);
    raw.prepare('INSERT INTO profile(id,name,birth_date,height_cm,start_weight,target_weight,experience,fitness_goal,growth_goals,language,completed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run('p1', 'T', '1990-01-01', 170, 79.2, 73, 'Beginner', 'Health', '', 'en', '2026-01-01');
    raw.prepare('INSERT INTO weights VALUES (?,?,?,?,?,?)').run('hist', 'p1', '2026-11-17', 76.1, '', '2026-11-17T08:00:00.000Z');
    raw.exec("UPDATE sync_control SET choice='enabled' WHERE id=1");
  });
  afterEach(() => { vi.useRealTimers(); });

  const rows = () => raw.prepare('SELECT id, day, kg FROM weights ORDER BY day, created_at').all() as { id: string; day: string; kg: number }[];

  it('adds today, then edits the same row, never touching yesterday', async () => {
    const first = await repo.saveTodayWeight('p1', 76.6);
    const second = await repo.saveTodayWeight('p1', 76.4);
    expect(second?.id).toBe(first?.id);
    expect(rows()).toEqual([{ id: 'hist', day: '2026-11-17', kg: 76.1 }, { id: first!.id, day: '2026-11-18', kg: 76.4 }]);
  });
  it('refuses to overwrite or delete a historical row, and leaves it intact', async () => {
    await expect(repo.saveWeight({ id: 'hist', owner_id: 'p1', day: '2026-11-17', kg: 60, note: '', created_at: '2026-11-17T08:00:00.000Z' })).rejects.toThrow(WeightHistoryLockedError);
    await expect(repo.saveWeight({ id: 'hist', owner_id: 'p1', day: '2026-11-18', kg: 60, note: '', created_at: '2026-11-17T08:00:00.000Z' })).rejects.toThrow(WeightHistoryLockedError);
    await expect(repo.saveWeight({ id: 'new', owner_id: 'p1', day: '2026-11-10', kg: 60, note: '', created_at: 'x' })).rejects.toThrow(WeightHistoryLockedError);
    await expect(repo.remove('weights', 'hist')).rejects.toThrow(WeightHistoryLockedError);
    expect(rows()).toEqual([{ id: 'hist', day: '2026-11-17', kg: 76.1 }]);
  });
  it('after midnight yesterday’s value becomes read-only and a new day gets its own row', async () => {
    const before = await repo.saveTodayWeight('p1', 76.4);
    vi.setSystemTime(new Date(2026, 10, 19, 0, 5));
    await expect(repo.saveWeight({ ...before!, kg: 70 })).rejects.toThrow(WeightHistoryLockedError);
    const after = await repo.saveTodayWeight('p1', 76.2);
    expect(after?.id).not.toBe(before?.id);
    expect(rows().map(r => [r.day, r.kg])).toEqual([['2026-11-17', 76.1], ['2026-11-18', 76.4], ['2026-11-19', 76.2]]);
  });
  it('today’s entry can still be deleted and edits are queued for cloud backup as the same record', async () => {
    const saved = await repo.saveTodayWeight('p1', 76.4);
    await repo.saveTodayWeight('p1', 76.3);
    const queued = raw.prepare("SELECT record_id, action FROM sync_outbox WHERE kind='weights'").all() as { record_id: string; action: string }[];
    expect(queued).toEqual([{ record_id: saved!.id, action: 'upsert' }]);
    await repo.remove('weights', saved!.id);
    expect(rows()).toEqual([{ id: 'hist', day: '2026-11-17', kg: 76.1 }]);
  });
  it('the profile starting weight is not changed by weigh-ins', async () => {
    await repo.saveTodayWeight('p1', 70);
    expect((raw.prepare('SELECT start_weight FROM profile').get() as { start_weight: number }).start_weight).toBe(79.2);
  });
});
