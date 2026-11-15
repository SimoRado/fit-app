import { describe, expect, it } from 'vitest';
import { gymSchedulePreferenceKey, moveInList, parseGymSchedule, planForWeekday, serializeGymSchedule, setGymDayPlan } from '../src/core/gymSchedule';

describe('weekly gym schedule', () => {
  it('uses one stable, synced preference key', () => {
    expect(gymSchedulePreferenceKey).toBe('training.weekly-plan.v1');
  });

  it('keeps one routine or rest plan per weekday and round-trips safely', () => {
    const monday = setGymDayPlan([], 1, { weekday: 1, kind: 'routine', routineId: 'push' });
    const replaced = setGymDayPlan(monday, 1, { weekday: 1, kind: 'rest' });
    const restored = parseGymSchedule(serializeGymSchedule(replaced));
    expect(restored).toEqual([{ weekday: 1, kind: 'rest' }]);
    expect(planForWeekday(restored, 1)).toEqual({ weekday: 1, kind: 'rest' });
  });

  it('drops malformed persisted entries instead of blocking offline training', () => {
    expect(parseGymSchedule('{')).toEqual([]);
    expect(parseGymSchedule(JSON.stringify([{ weekday: 8, kind: 'rest' }, { weekday: 2, kind: 'routine', routineId: '' }]))).toEqual([]);
  });

  it('reorders routine drafts without mutating or losing items', () => {
    const draft = ['squat', 'bench', 'row'];
    expect(moveInList(draft, 2, 0)).toEqual(['row', 'squat', 'bench']);
    expect(draft).toEqual(['squat', 'bench', 'row']);
    expect(moveInList(draft, 4, 0)).toEqual(draft);
  });
});
