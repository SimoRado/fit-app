import { fromDay } from '../core/date';

export const localeFor = (language: string) => language === 'fr' ? 'fr-FR' : language === 'ar' ? 'ar-u-nu-arab' : 'en-US';

/** Prototype-style short date: "Tue 17 Nov" (or "17 Nov"), in each language's own words. */
export function shortDay(locale: string, day: string, weekday = true) {
  const parts = new Intl.DateTimeFormat(locale, { ...(weekday ? { weekday: 'short' as const } : {}), day: 'numeric', month: 'short' }).formatToParts(fromDay(day));
  if (locale.startsWith('ar')) return parts.map(part => part.value).join('');
  const get = (type: string) => parts.find(part => part.type === type)?.value.replace(/\.$/, '') ?? '';
  return [weekday ? get('weekday') : '', get('day'), get('month')].filter(Boolean).join(' ');
}

const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Weight chart X-axis label (see `axisTicks` in core/weightChart): "19 Nov" (7D), "15" (30D),
 * "Sep 15" (90D). English uses fixed three-letter months so ICU variants ("Sept") never widen a
 * label; French and Arabic use their own short month names and order.
 */
export function axisLabel(locale: string, tick: { day: string; kind: 'dayMonth' | 'day' | 'monthDay' }) {
  const date = fromDay(tick.day);
  if (tick.kind === 'day') return new Intl.DateTimeFormat(locale, { day: 'numeric' }).format(date);
  if (locale.startsWith('en')) {
    const month = EN_MONTHS[date.getMonth()], day = date.getDate();
    return tick.kind === 'dayMonth' ? `${day} ${month}` : `${month} ${day}`;
  }
  return shortDay(locale, tick.day, false);
}
