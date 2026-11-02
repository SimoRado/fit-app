import { addDays, dayKey, daysBetween, fromDay, weekStart } from './date';
import { Exercise, Habit, HabitCompletion, Mission, MissionCompletion, WeightEntry, Workout, WorkoutExercise, WorkoutSet } from './types';

export const scheduled = (habit: Habit, day: string) => !habit.archived && day >= habit.start_date && (habit.frequency === 'daily' || habit.frequency === 'quota' || habit.days.split(',').includes(String(fromDay(day).getDay())));
export const habitDone = (habit: Habit, completions: HabitCompletion[], day: string) => completions.some(c => c.habit_id === habit.id && c.day === day);
export function habitRate(habits: Habit[], completions: HabitCompletion[], start: string, end: string, includeQuota = start !== end) {
  let due = 0, done = 0;
  for (const day of daysBetween(start, end)) for (const h of habits) if (h.frequency !== 'quota' && scheduled(h, day)) { due++; if (habitDone(h, completions, day)) done++; }
  const weeks = [...new Set(daysBetween(start, end).map(weekStart))];
  for (const h of habits.filter(h => !h.archived && h.frequency === 'quota')) for (const week of weeks) {
    if (!includeQuota) continue;
    if (addDays(week, 6) < h.start_date) continue;
    const count = completions.filter(c => c.habit_id === h.id && c.day >= week && c.day <= addDays(week, 6) && c.day >= start && c.day <= end).length;
    const weekEnd = addDays(week, 6);
    const eligible = daysBetween(week, weekEnd).filter(d => d >= h.start_date).length;
    const selectedDays = start === end ? eligible : daysBetween(start > week ? start : week, end < weekEnd ? end : weekEnd).filter(d => d >= h.start_date).length;
    const target = eligible ? Math.min(h.weekly_target, Math.ceil(h.weekly_target * selectedDays / eligible)) : 0;
    due += target; done += Math.min(count, target);
  }
  return { due, done, remaining: Math.max(0, due - done), percent: due ? Math.round(done / due * 100) : 0 };
}
export function habitStreak(h: Habit, completions: HabitCompletion[], today = dayKey()) {
  const complete = new Set(completions.filter(c => c.habit_id === h.id).map(c => c.day));
  const units: boolean[] = [];
  if (h.frequency === 'quota') {
    for (let w = weekStart(h.start_date); w <= weekStart(today); w = addDays(w, 7)) {
      const firstEligible = h.start_date > w ? h.start_date : w;
      const availableDays = daysBetween(firstEligible, addDays(w, 6)).length;
      const count = [...complete].filter(d => d >= w && d >= h.start_date && d <= addDays(w, 6)).length;
      units.push(count >= Math.min(h.weekly_target, availableDays));
    }
  } else for (let d = h.start_date; d <= today; d = addDays(d, 1)) if (scheduled(h, d)) units.push(complete.has(d));
  let longest = 0, run = 0;
  for (const yes of units) { run = yes ? run + 1 : 0; longest = Math.max(longest, run); }
  // An unfinished current day/week does not erase a streak still in progress.
  const current = units.at(-1) ? run : (() => { let n = 0; for (let i = units.length - 2; i >= 0 && units[i]; i--) n++; return n; })();
  return { current, longest, total: complete.size };
}
export function missionProgress(m: Mission, day: string, data: { completions: HabitCompletion[]; workouts: Workout[]; weights: WeightEntry[]; manual: MissionCompletion[] }) {
  const start = m.period === 'weekly' ? weekStart(day) : day;
  const inPeriod = (d: string) => d >= start && d <= day;
  const value = m.type === 'manual' ? Number(data.manual.some(x => x.mission_id === m.id && inPeriod(x.day))) : m.type === 'habits' ? data.completions.filter(x => inPeriod(x.day)).length : m.type === 'workouts' ? data.workouts.filter(x => x.completed && inPeriod(x.day)).length : data.weights.filter(x => inPeriod(x.day)).length;
  return { value, target: m.target, done: value >= m.target };
}
export function missionRate(missions: Mission[], data: { completions: HabitCompletion[]; workouts: Workout[]; weights: WeightEntry[]; manual: MissionCompletion[] }, start: string, end: string) {
  let due = 0, done = 0;
  for (const mission of missions.filter(m => m.active)) {
    if (mission.period === 'daily') {
      for (const day of daysBetween(start, end)) {
        due++;
        if (missionProgress(mission, day, data).done) done++;
      }
    } else {
      const firstWeek = weekStart(start), lastWeek = weekStart(end);
      for (let week = firstWeek; week <= lastWeek; week = addDays(week, 7)) {
        const weekEnd = addDays(week, 6);
        // Weekly challenges belong to the selected period when their week overlaps it.
        if (weekEnd < start || week > end) continue;
        due++;
        if (missionProgress(mission, end < weekEnd ? end : weekEnd, data).done) done++;
      }
    }
  }
  return { due, done, remaining: Math.max(0, due - done), percent: due ? Math.round(done / due * 100) : 0 };
}
export function weightSummary(entries: WeightEntry[]) { const sorted = [...entries].sort((a, b) => a.day.localeCompare(b.day) || a.created_at.localeCompare(b.created_at)); const first = sorted[0], latest = sorted.at(-1); return { first, latest, change: first && latest && first.id !== latest.id ? +(latest.kg - first.kg).toFixed(1) : null }; }
export function weightGoalProgress(start: number, current: number, target: number | null | undefined) {
  if (target == null) return null;
  if (start === target) return current === target ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round((current - start) / (target - start) * 100)));
}
export function personalRecords(exercises: Exercise[], links: WorkoutExercise[], sets: WorkoutSet[], workouts: Workout[]) {
  const completedIds = new Set(workouts.filter(workout => workout.completed).map(workout => workout.id));
  return exercises.map(exercise => {
    const linkIds = new Set(links.filter(link => link.exercise_id === exercise.id && completedIds.has(link.workout_id)).map(link => link.id));
    const relevant = sets.filter(set => linkIds.has(set.workout_exercise_id));
    if (exercise.metric === 'duration') return { name: exercise.name, metric: exercise.metric, value: Math.max(0, ...relevant.map(set => set.duration_sec ?? 0)), reps: null };
    if (exercise.metric === 'reps') return { name: exercise.name, metric: exercise.metric, value: Math.max(0, ...relevant.map(set => set.reps ?? 0)), reps: null };
    const best = relevant.slice().sort((a, b) => (b.weight_kg ?? 0) - (a.weight_kg ?? 0) || (b.reps ?? 0) - (a.reps ?? 0))[0];
    return { name: exercise.name, metric: exercise.metric, value: best?.weight_kg ?? 0, reps: best?.reps ?? null };
  }).filter(record => record.value > 0 || (record.metric === 'weight_reps' && (record.reps ?? 0) > 0));
}
export function workoutStats(workouts: Workout[], today = dayKey()) { const completed = workouts.filter(w => w.completed); const byWeek = new Map<string, number>(); for (const w of completed) byWeek.set(weekStart(w.day), (byWeek.get(weekStart(w.day)) ?? 0) + 1); return { total: completed.length, week: completed.filter(w => w.day >= weekStart(today) && w.day <= today).length, month: completed.filter(w => w.day.slice(0, 7) === today.slice(0, 7)).length, minutes: completed.reduce((n, w) => n + (w.duration_min ?? 0), 0), mostInWeek: Math.max(0, ...byWeek.values()) }; }
