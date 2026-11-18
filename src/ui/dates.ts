import { fromDay } from '../core/date';

export const localeFor = (language: string) => language === 'fr' ? 'fr-FR' : language === 'ar' ? 'ar-u-nu-arab' : 'en-US';

/** Prototype-style short date: "Tue 17 Nov" (or "17 Nov"), in each language's own words. */
export function shortDay(locale: string, day: string, weekday = true) {
  const parts = new Intl.DateTimeFormat(locale, { ...(weekday ? { weekday: 'short' as const } : {}), day: 'numeric', month: 'short' }).formatToParts(fromDay(day));
  if (locale.startsWith('ar')) return parts.map(part => part.value).join('');
  const get = (type: string) => parts.find(part => part.type === type)?.value.replace(/\.$/, '') ?? '';
  return [weekday ? get('weekday') : '', get('day'), get('month')].filter(Boolean).join(' ');
}
