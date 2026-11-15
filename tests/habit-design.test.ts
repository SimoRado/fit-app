import { describe, expect, it } from 'vitest';
import { wheelIndexes, wheelTime, displayTime, frequencyLabel, frequencyPreset, fromMinutes, habitDurationMinutes, habitGroup, isHabitIconId, minutesLeft, nowLineIndex, scheduleLine, STARTER_HABITS, toMinutes } from '../src/core/habitDesign';
import { scheduled } from '../src/core/logic';
import type { Habit } from '../src/core/types';

const base: Habit = { id: 'h', owner_id: 'o', name: 'Walk', description: '', category: 'Body', icon: 'bolt', frequency: 'daily', days: '0,1,2,3,4,5,6', weekly_target: 7, start_date: '2026-11-01', archived: 0, reminder_time: null, created_at: '2026-11-01T00:00:00Z' };

describe('habit categories and icons', () => {
  it('maps legacy categories onto Body / Mind / Routine without rewriting them', () => {
    expect(habitGroup('Fitness')).toBe('Body');
    expect(habitGroup('Nutrition')).toBe('Body');
    expect(habitGroup('Productivity')).toBe('Mind');
    expect(habitGroup('Mental Well-being')).toBe('Mind');
    expect(habitGroup('Other')).toBe('Routine');
    expect(habitGroup('Mind')).toBe('Mind');
    expect(habitGroup(undefined)).toBe('Routine');
  });
  it('uses stable icon ids and treats legacy emoji as text', () => {
    expect(isHabitIconId('drop')).toBe(true);
    expect(isHabitIconId('✓')).toBe(false);
    expect(isHabitIconId('toString')).toBe(false);
  });
  it('starter habits never invent a reminder; only bedtime has a time', () => {
    expect(STARTER_HABITS.map(item => item.name)).toEqual(['Drink 2L of water', 'Read 10 pages', 'Bed by 11 PM', 'Walk 20 min']);
    expect(STARTER_HABITS.filter(item => item.time)).toEqual([expect.objectContaining({ name: 'Bed by 11 PM', time: '23:00' })]);
  });
});

describe('frequency presets', () => {
  it('round-trips the WHEN chips and keeps custom schedules intact', () => {
    expect(frequencyPreset({ frequency: 'daily', days: '', weekly_target: 7 })).toBe('daily');
    expect(frequencyPreset({ frequency: 'days', days: '5,1,2,4,3', weekly_target: 7 })).toBe('weekdays');
    expect(frequencyPreset({ frequency: 'quota', days: '', weekly_target: 3 })).toBe('quota3');
    expect(frequencyPreset({ frequency: 'quota', days: '', weekly_target: 4 })).toBe('custom');
    expect(frequencyPreset({ frequency: 'days', days: '1,3,5', weekly_target: 3 })).toBe('custom');
    expect(frequencyLabel({ frequency: 'days', days: '0,1,3', weekly_target: 3 })).toBe('Mon, Wed, Sun');
    expect(frequencyLabel({ frequency: 'quota', days: '', weekly_target: 3 })).toBe('3× a week');
  });
  it('weekdays are due Monday–Friday only, across a week boundary', () => {
    const weekdays = { ...base, frequency: 'days' as const, days: '1,2,3,4,5' };
    // 2026-11-13 Fri, 14 Sat, 15 Sun, 16 Mon
    expect(['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16'].map(day => scheduled(weekdays, day))).toEqual([true, false, false, true]);
    expect(scheduled(weekdays, '2026-10-30')).toBe(false); // before start date
  });
});

describe('time display and real durations', () => {
  it('stores HH:mm and displays 12 h or 24 h', () => {
    expect(displayTime('07:30', true)).toBe('07:30 AM');
    expect(displayTime('00:05', true)).toBe('12:05 AM');
    expect(displayTime('12:00', true)).toBe('12:00 PM');
    expect(displayTime('23:59', false)).toBe('23:59');
    expect(fromMinutes(toMinutes('23:50') + 20)).toBe('00:10');
  });
  it('wheel positions round-trip every time, including midnight and noon', () => {
    for (const hour12 of [true, false]) for (let h = 0; h < 24; h++) for (const m of [0, 1, 30, 59]) {
      const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const w = wheelIndexes(time, hour12);
      expect(wheelTime(w.hour, w.minute, w.period, hour12)).toBe(time);
    }
    expect(wheelIndexes('00:15', true)).toEqual({ hour: 11, minute: 15, period: 0 }); // 12:15 AM
    expect(wheelIndexes('12:00', true)).toEqual({ hour: 11, minute: 0, period: 1 });  // 12:00 PM
    expect(wheelTime(11, 0, 0, true)).toBe('00:00');
    expect(wheelTime(8, 32, 1, true)).toBe('21:32');
  });
  it('only measured minute/hour habits get a duration and end time', () => {
    expect(habitDurationMinutes(base)).toBeNull();
    expect(habitDurationMinutes({ habit_type: 'quantity', unit: 'min', target_value: 20 })).toBe(20);
    expect(habitDurationMinutes({ habit_type: 'quantity', unit: 'hours', target_value: 1 })).toBe(60);
    expect(habitDurationMinutes({ habit_type: 'quantity', unit: 'pages', target_value: 10 })).toBeNull();
    expect(scheduleLine('08:00', 20, false)).toBe('08:00 – 08:20 · 20 min');
    expect(scheduleLine('10:00', 60, false)).toBe('10:00 – 11:00 · 1 h');
    expect(scheduleLine('07:30', null, true)).toBe('07:30 AM');
  });
  it('places the Now line between items and computes time left inside an interval', () => {
    expect(nowLineIndex(['07:00', '08:00', '18:00', '23:00'], '18:51')).toBe(3);
    expect(nowLineIndex(['07:00', '08:00'], '06:00')).toBeNull();
    expect(nowLineIndex(['07:00', '08:00'], '09:00')).toBeNull();
    expect(minutesLeft('18:00', 60, '18:51')).toBe(9);
    expect(minutesLeft('18:00', 60, '19:00')).toBeNull();
    expect(minutesLeft('18:00', null, '18:10')).toBeNull();
  });
});
