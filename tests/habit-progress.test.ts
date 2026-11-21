import { DatabaseSync } from 'node:sqlite';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { amountLabel, applyAmountDelta, formatAmount, habitRatio, nextAmount, quantityDone } from '../src/core/habitProgress';
import type { Habit, HabitCompletion, HabitProgress } from '../src/core/types';
import { FeatureLimitError } from '../src/services/featureLimits';

// Real migrations + sync triggers on node:sqlite, driven through the app's own db.ts.
const fixture = vi.hoisted(() => ({ raw: null as unknown }));
vi.mock('expo-sqlite', () => ({ openDatabaseAsync: async () => adapter(fixture.raw as DatabaseSync) }));
vi.mock('../src/data/exerciseCatalog', () => ({ importExerciseCatalog: vi.fn(), normalizeExerciseText: (value: string) => value, exerciseSearchStatement: vi.fn(() => ({ sql: '', args: [] })) }));
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

const TODAY = new Date();
const day = (offset = 0) => { const d = new Date(TODAY); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const water: Habit = { id: 'water', owner_id: 'p1', name: 'Drink 3L of water', description: '', category: 'Body', icon: 'drop', frequency: 'daily', days: '0,1,2,3,4,5,6', weekly_target: 7, start_date: day(-30), archived: 0, reminder_time: null, created_at: '2026-01-01T00:00:00.000Z', habit_type: 'quantity', target_value: 3, unit: 'L', increment: 1, reminder_enabled: 0, reminder_times: '[]', sort_order: 0 };

describe('accumulative maths (shared by SQLite and the screen)', () => {
  it('0 → 1 → 2 → 3 L completes at the target, and removing 1 L un-completes', () => {
    let progress: HabitProgress[] = [], completions: HabitCompletion[] = [];
    const states: [number, number, boolean][] = [];
    for (const delta of [1, 1, 1, -1]) {
      const next = applyAmountDelta(progress, completions, water, '2026-11-15', delta);
      progress = next.progress; completions = next.completions;
      const row = progress[0];
      states.push([row?.amount ?? 0, Math.round(habitRatio(water, row, next.done) * 100), quantityDone(water, row)]);
    }
    expect(states).toEqual([[1, 33, false], [2, 67, false], [3, 100, true], [2, 67, false]]);
    expect(completions).toHaveLength(0);
    expect(amountLabel(water, progress[0])).toBe('2 / 3 L');
  });
  it('compounds rapid functional updates without losing a tap', () => {
    let state = { progress: [] as HabitProgress[], completions: [] as HabitCompletion[] };
    const tap = (s: typeof state) => { const n = applyAmountDelta(s.progress, s.completions, water, 'd', 1); return { progress: n.progress, completions: n.completions }; };
    for (let i = 0; i < 5; i++) state = tap(state);
    expect(state.progress[0].amount).toBe(5);
    expect(state.completions).toHaveLength(1); // one completion record, not one per tap
  });
  it('never goes below zero and removes the row at zero', () => {
    const next = applyAmountDelta([], [], water, 'd', -1);
    expect(next.amount).toBe(0);
    expect(next.progress).toHaveLength(0);
    expect(nextAmount(0.1, 0.2)).toBe(0.3);
  });
  it('uses each habit’s own target, unit and step, never the name', () => {
    const cases: [Partial<Habit>, number, string][] = [
      [{ target_value: 20, unit: 'pages', increment: 5 }, 25, '5 / 20 pages'],
      [{ target_value: 10000, unit: 'steps', increment: 1000 }, 10, '1,000 / 10,000 steps'],
      [{ target_value: 60, unit: 'min', increment: 15 }, 25, '15 / 60 min'],
      [{ target_value: 30, unit: 'reps', increment: 10 }, 33, '10 / 30 reps'],
    ];
    for (const [config, percent, label] of cases) {
      const habit = { ...water, name: 'Drink 3L of water', ...config };
      const next = applyAmountDelta([], [], habit, 'd', habit.increment!);
      expect(Math.round(habitRatio(habit, next.progress[0], next.done) * 100)).toBe(percent);
      expect(amountLabel(habit, next.progress[0])).toBe(label);
    }
    expect(formatAmount(0.25)).toBe('0.25');
  });
  it('caps the visual at 100% while keeping the real over-target amount', () => {
    const row = { amount: 4, target_snapshot: 3 };
    expect(habitRatio(water, row, true)).toBe(1);
    expect(amountLabel(water, { ...row, unit_snapshot: 'L' })).toBe('4 / 3 L');
  });
  it('yes/no habits are 0% or 100%', () => {
    const plain = { ...water, habit_type: 'boolean' as const };
    expect(habitRatio(plain, undefined, false)).toBe(0);
    expect(habitRatio(plain, undefined, true)).toBe(1);
  });
});

describe('SQLite: atomic progress, completion records, sync queue', () => {
  let raw: DatabaseSync;
  beforeAll(() => setLocalAccount('user_test'));
  beforeEach(async () => {
    raw = new DatabaseSync(':memory:');
    fixture.raw = raw;
    setLocalAccount(`user_${Math.random().toString(36).slice(2)}`);
    for (const migration of migrations) raw.exec(migration);
    raw.exec(`PRAGMA user_version = ${migrations.length}`);
    raw.exec("UPDATE sync_control SET choice='enabled' WHERE id=1");
    raw.prepare('INSERT INTO profile(id,name,birth_date,height_cm,start_weight,target_weight,experience,fitness_goal,growth_goals,language,completed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run('p1', 'T', '1990-01-01', 170, 70, null, 'Beginner', 'Health', '', 'en', '2026-01-01');
    await repo.saveHabit(water, { isPremium: true });
  });
  const amount = (d: string) => (raw.prepare('SELECT amount FROM habit_progress WHERE habit_id=? AND day=?').get('water', d) as { amount: number } | undefined)?.amount ?? 0;
  const completed = (d: string) => (raw.prepare('SELECT count(*) n FROM habit_completions WHERE habit_id=? AND day=?').get('water', d) as { n: number }).n;

  it('stores 0 → 1 → 2 → 3 → 2 L with exactly one completion only at the target', async () => {
    const seen: [number, number][] = [];
    for (const delta of [1, 1, 1, -1]) { await repo.addHabitAmount('water', day(), delta); seen.push([amount(day()), completed(day())]); }
    expect(seen).toEqual([[1, 0], [2, 0], [3, 1], [2, 0]]);
  });
  it('rapid concurrent taps are serialised: none lost, none doubled', async () => {
    await Promise.all([1, 2, 3, 4].map(() => repo.addHabitAmount('water', day(), 1)));
    expect(amount(day())).toBe(4);
    expect(completed(day())).toBe(1);
  });
  it('keeps progress on its own date', async () => {
    await repo.addHabitAmount('water', day(-1), 1);
    await repo.addHabitAmount('water', day(), 2);
    expect([amount(day(-1)), amount(day())]).toEqual([1, 2]);
  });
  it('removing below zero clears the row (synced as a delete) instead of going negative', async () => {
    await repo.addHabitAmount('water', day(), 1);
    await repo.addHabitAmount('water', day(), -1);
    await repo.addHabitAmount('water', day(), -1);
    expect(raw.prepare('SELECT count(*) n FROM habit_progress').get()).toEqual({ n: 0 });
  });
  it('queues one progress upsert and the completion for cloud backup', async () => {
    for (let i = 0; i < 3; i++) await repo.addHabitAmount('water', day(), 1);
    const queue = raw.prepare("SELECT kind, record_id, action FROM sync_outbox WHERE kind IN ('habit_progress','habit_completions') ORDER BY kind").all();
    expect(queue).toEqual([{ kind: 'habit_completions', record_id: `water:${day()}`, action: 'upsert' }, { kind: 'habit_progress', record_id: `water:${day()}`, action: 'upsert' }]);
  });
  it('a new goal applies from today on; earlier days keep the target they were tracked against', async () => {
    await repo.addHabitAmount('water', day(-1), 3); // completed yesterday at 3 L
    await repo.addHabitAmount('water', day(), 3);   // completed today at 3 L
    await repo.saveHabit({ ...water, target_value: 4 }, { isPremium: true });
    const target = (d: string) => (raw.prepare('SELECT target_snapshot t FROM habit_progress WHERE habit_id=? AND day=?').get('water', d) as { t: number }).t;
    expect([target(day(-1)), target(day())]).toEqual([3, 4]);
    expect([amount(day(-1)), amount(day())]).toEqual([3, 3]);           // progress preserved
    expect([completed(day(-1)), completed(day())]).toEqual([1, 0]);     // today now 3 / 4
  });
  it('rejects progress on a yes/no habit', async () => {
    await repo.saveHabit({ ...water, id: 'plain', habit_type: 'boolean' }, { isPremium: true });
    await expect(repo.addHabitAmount('plain', day(), 1)).rejects.toThrow();
  });

  it('caps Free accounts at three active habits atomically, preserves existing records, and frees a deleted slot', async () => {
    const free = { isPremium: false };
    const second = { ...water, id: 'h2', name: 'Second habit' };
    const third = { ...water, id: 'h3', name: 'Third habit' };
    const fourth = { ...water, id: 'h4', name: 'Fourth habit' };
    await repo.saveHabit(second, free);
    await repo.saveHabit(third, free);
    await expect(repo.saveHabit(fourth, free)).rejects.toBeInstanceOf(FeatureLimitError);
    // Existing accounts that became over-limit remain editable after expiry.
    await repo.saveHabit({ ...fourth, name: 'Existing fourth' }, { isPremium: true });
    await repo.saveHabit({ ...fourth, name: 'Existing fourth, edited' }, free);
    await repo.deleteHabit(second.id);
    await repo.deleteHabit(third.id);
    await repo.saveHabit({ ...water, id: 'h5', name: 'Replacement habit' }, free);
    expect(raw.prepare('SELECT COUNT(*) AS n FROM habits WHERE owner_id=? AND archived=0').get('p1')).toEqual({ n: 3 });
  });

  it('does not let rapid Free habit creation requests race past the active limit', async () => {
    const attempts = await Promise.allSettled(['h2', 'h3', 'h4', 'h5'].map(id => repo.saveHabit({ ...water, id, name: id }, { isPremium: false })));
    expect(attempts.filter(item => item.status === 'fulfilled')).toHaveLength(2);
    expect(attempts.filter(item => item.status === 'rejected')).toHaveLength(2);
    expect(raw.prepare('SELECT COUNT(*) AS n FROM habits WHERE owner_id=? AND archived=0').get('p1')).toEqual({ n: 3 });
  });
});

describe('Schedule vs Anytime and ordering', () => {
  it('a stored time is the schedule; reminders are separate; same-time habits keep manual order', async () => {
    const { reminderTimes } = await import('../src/core/habitExtras');
    const h = (id: string, times: string[], sort: number, reminder = 0): Habit => ({ ...water, id, reminder_times: JSON.stringify(times), reminder_enabled: reminder, sort_order: sort });
    const habits = [h('late', ['23:00'], 0), h('anytime', [], 1), h('b', ['08:00'], 3), h('a', ['08:00'], 2, 1), h('early', ['07:00'], 4)];
    const timed = habits.filter(x => reminderTimes(x).length).sort((a, b) => reminderTimes(a)[0].localeCompare(reminderTimes(b)[0]) || (a.sort_order ?? 0) - (b.sort_order ?? 0));
    expect(timed.map(x => x.id)).toEqual(['early', 'a', 'b', 'late']);
    expect(habits.filter(x => !reminderTimes(x).length).map(x => x.id)).toEqual(['anytime']);
    // Reminder off does not make a timed habit Anytime.
    expect(reminderTimes(h('quiet', ['12:30'], 0, 0))).toEqual(['12:30']);
  });
});
