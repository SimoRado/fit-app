import type { Habit } from './types';

/**
 * Volt Habits vocabulary: three categories, a fixed icon set with stable ids,
 * one-tap starter habits and the WHEN presets. Pure data/helpers (no React) so
 * they are unit-tested and shared by the dashboard and the New habit sheet.
 */

export type HabitGroup = 'Body' | 'Mind' | 'Routine';
export const HABIT_GROUPS: { id: HabitGroup; subtitle: string; defaultIcon: HabitIconId; suggestions: string[] }[] = [
  { id: 'Body', subtitle: 'Move and fuel', defaultIcon: 'bolt', suggestions: ['Stretch 10 min', 'Walk 20 min', 'Drink 2L of water'] },
  { id: 'Mind', subtitle: 'Learn and focus', defaultIcon: 'book', suggestions: ['Journal 5 min', 'Read 10 pages', 'Meditate 5 min'] },
  { id: 'Routine', subtitle: 'Your daily rhythm', defaultIcon: 'sun', suggestions: ['Wake up at 7 AM', 'Bed by 11 PM', 'Plan tomorrow'] },
];

/** Older categories (pre-Volt form) map onto the three groups for display; the stored value is untouched. */
const LEGACY_GROUP: Record<string, HabitGroup> = {
  Fitness: 'Body', Nutrition: 'Body', Body: 'Body',
  Productivity: 'Mind', 'Mental Well-being': 'Mind', 'Personal Development': 'Mind', Mind: 'Mind',
  Other: 'Routine', Routine: 'Routine',
};
export const habitGroup = (category: string | null | undefined): HabitGroup => LEGACY_GROUP[category ?? ''] ?? 'Routine';

/** Stable icon ids stored in `habits.icon`. Anything else (legacy emoji) is displayed as text. */
export const HABIT_ICONS = {
  bolt: { filled: 'flash', outline: 'flash-outline', label: 'Lightning' },
  flame: { filled: 'flame', outline: 'flame-outline', label: 'Flame' },
  book: { filled: 'book', outline: 'book-outline', label: 'Book' },
  sun: { filled: 'sunny', outline: 'sunny-outline', label: 'Sun' },
  moon: { filled: 'moon', outline: 'moon-outline', label: 'Moon' },
  drop: { filled: 'water', outline: 'water-outline', label: 'Water drop' },
  target: { filled: 'radio-button-on', outline: 'radio-button-on-outline', label: 'Target' },
  dumbbell: { filled: 'barbell', outline: 'barbell-outline', label: 'Dumbbell' },
} as const;
export type HabitIconId = keyof typeof HABIT_ICONS;
export const HABIT_ICON_IDS = Object.keys(HABIT_ICONS) as HabitIconId[];
export const isHabitIconId = (value: string | null | undefined): value is HabitIconId => !!value && Object.prototype.hasOwnProperty.call(HABIT_ICONS, value);

/** One-tap starters (empty state). Only "Bed by 11 PM" has a natural time; none enables a reminder. */
export type StarterHabit = { name: string; group: HabitGroup; icon: HabitIconId; time: string | null };
export const STARTER_HABITS: StarterHabit[] = [
  { name: 'Drink 2L of water', group: 'Body', icon: 'drop', time: null },
  { name: 'Read 10 pages', group: 'Mind', icon: 'book', time: null },
  { name: 'Bed by 11 PM', group: 'Routine', icon: 'moon', time: '23:00' },
  { name: 'Walk 20 min', group: 'Body', icon: 'bolt', time: null },
];

export type FrequencyPreset = 'daily' | 'weekdays' | 'quota3' | 'custom';
export const WEEKDAYS = '1,2,3,4,5';
/** Maps stored frequency fields to the WHEN chips. Anything not a preset is "custom" so nothing is lost on edit. */
export function frequencyPreset(habit: Pick<Habit, 'frequency' | 'days' | 'weekly_target'>): FrequencyPreset {
  if (habit.frequency === 'daily') return 'daily';
  if (habit.frequency === 'quota') return habit.weekly_target === 3 ? 'quota3' : 'custom';
  return normalizeDays(habit.days) === WEEKDAYS ? 'weekdays' : 'custom';
}
export function normalizeDays(days: string) {
  return [...new Set(days.split(',').map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b).join(',');
}
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function frequencyLabel(habit: Pick<Habit, 'frequency' | 'days' | 'weekly_target'>) {
  if (habit.frequency === 'daily') return 'Daily';
  if (habit.frequency === 'quota') return `${habit.weekly_target}× a week`;
  const days = normalizeDays(habit.days);
  if (days === WEEKDAYS) return 'Weekdays';
  if (days === '0,6') return 'Weekends';
  // Monday-first listing.
  return days.split(',').filter(Boolean).map(Number).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(day => SHORT_DAYS[day]).join(', ');
}

/** "07:30" → "07:30 AM" (12 h) or "07:30" (24 h). Storage is always HH:mm. */
export function displayTime(time: string, hour12: boolean) {
  const [h, m] = time.split(':').map(Number);
  if (!hour12) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return `${String(h % 12 === 0 ? 12 : h % 12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
/** "HH:mm" → wheel positions. 12 h: hours 01–12 (index 0–11) + AM/PM; 24 h: 00–23. */
export function wheelIndexes(time: string, hour12: boolean) {
  const [h, m] = time.split(':').map(Number);
  return { hour: hour12 ? (h % 12 === 0 ? 12 : h % 12) - 1 : h, minute: m, period: h < 12 ? 0 : 1 };
}
/** Wheel positions → "HH:mm" (12 AM = 00, 12 PM = 12). */
export function wheelTime(hourIndex: number, minute: number, period: number, hour12: boolean) {
  const hour = hour12 ? ((hourIndex + 1) % 12) + period * 12 : hourIndex;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
export const toMinutes = (time: string) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
export const fromMinutes = (total: number) => { const wrapped = ((total % 1440) + 1440) % 1440; return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`; };

/**
 * Real duration, only when the data defines one: a measured habit whose unit is
 * minutes or hours (e.g. "Read 20 min"). Plain yes/no habits have no stored
 * duration, so no end time is invented for them.
 */
export function habitDurationMinutes(habit: Pick<Habit, 'habit_type' | 'unit' | 'target_value'>): number | null {
  if (habit.habit_type !== 'quantity' || !habit.target_value || habit.target_value <= 0) return null;
  const unit = (habit.unit ?? '').trim().toLowerCase();
  if (['min', 'mins', 'minute', 'minutes'].includes(unit)) return Math.round(habit.target_value);
  if (['h', 'hr', 'hrs', 'hour', 'hours'].includes(unit)) return Math.round(habit.target_value * 60);
  return null;
}
export function durationLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
/** Schedule sub-line: "08:00 – 08:20 · 20 min", or just the time when no duration is stored. */
export function scheduleLine(time: string, duration: number | null, hour12: boolean) {
  if (!duration) return displayTime(time, hour12);
  return `${displayTime(time, hour12)} – ${displayTime(fromMinutes(toMinutes(time) + duration), hour12)} · ${durationLabel(duration)}`;
}
/** Minutes left when `now` is inside [time, time + duration). */
export function minutesLeft(time: string, duration: number | null, now: string) {
  if (!duration) return null;
  const start = toMinutes(time), current = toMinutes(now);
  return current >= start && current < start + duration ? start + duration - current : null;
}
/** Index in a time-sorted list before which the "Now" line goes; null when not between items. */
export function nowLineIndex(times: string[], now: string): number | null {
  for (let index = 1; index < times.length; index++) if (times[index - 1] <= now && now < times[index]) return index;
  return null;
}
