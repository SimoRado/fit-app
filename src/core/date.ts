// Calendar keys are local YYYY-MM-DD values. Never derive a day by subtracting 24 hours.
export const dayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const fromDay = (key: string) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d, 12); };
export const addDays = (key: string, days: number) => { const d = fromDay(key); d.setDate(d.getDate() + days); return dayKey(d); };
export const weekStart = (key: string) => { const d = fromDay(key); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dayKey(d); };
export const daysBetween = (start: string, end: string) => { const result: string[] = []; for (let k = start; k <= end; k = addDays(k, 1)) result.push(k); return result; };
export const validDay = (key: string) => /^\d{4}-\d{2}-\d{2}$/.test(key) && dayKey(fromDay(key)) === key;
export const localTime = (date = new Date()) => `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
export const localTimestamp = (day: string, time: string) => {
  if (!validDay(day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Enter a valid date and local time in HH:MM format.');
  const [hour, minute] = time.split(':').map(Number), date = fromDay(day);
  date.setHours(hour, minute, 0, 0);
  if (date.getHours() !== hour || date.getMinutes() !== minute) throw new Error('That local time does not exist on this date because of a time change.');
  return date.toISOString();
};
export const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
