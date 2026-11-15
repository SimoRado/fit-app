/**
 * Day / Month / Year date entry. The UI order is DD MM YYYY; storage stays `YYYY-MM-DD`
 * (partially typed values are stored as `YYYY-MM-DD` with empty parts, which `validDay` rejects).
 */
export type DatePart = 'day' | 'month' | 'year';
export type DateParts = Record<DatePart, string>;
export const datePartOrder: readonly DatePart[] = ['day', 'month', 'year'];
export const datePartLength: Record<DatePart, number> = { day: 2, month: 2, year: 4 };

export function splitIsoDate(value: string | null | undefined): DateParts {
  const [year = '', month = '', day = ''] = (value ?? '').split('-');
  return { day, month, year };
}

export const joinIsoDate = (parts: DateParts) => `${parts.year}-${parts.month}-${parts.day}`;

export const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
export function daysInMonth(year: number, month: number) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * Applies one keystroke result to a part. A single day digit 4–9 or month digit 2–9 cannot start a
 * longer valid value, so it is padded ("5" → "05") and the cursor can move on immediately.
 */
export function typeDatePart(part: DatePart, input: string): { value: string; complete: boolean } {
  const digits = input.replace(/\D/g, '').slice(0, datePartLength[part]);
  if (part === 'day' && digits.length === 1 && Number(digits) >= 4) return { value: `0${digits}`, complete: true };
  if (part === 'month' && digits.length === 1 && Number(digits) >= 2) return { value: `0${digits}`, complete: true };
  return { value: digits, complete: digits.length === datePartLength[part] };
}

/** Pads a one-digit day or month when the user leaves the field ("7" → "07"). */
export const padDatePart = (part: DatePart, value: string) => part !== 'year' && value.length === 1 && value !== '0' ? `0${value}` : value;

/**
 * Parses a pasted full date. Accepts `DD/MM/YYYY`, `DD-MM-YYYY`, `DD.MM.YYYY`, ISO `YYYY-MM-DD`
 * and 8 digits (`DDMMYYYY`, or `YYYYMMDD` when it starts with a plausible year).
 */
export function parsePastedDate(text: string): DateParts | null {
  const trimmed = text.trim();
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(trimmed);
  if (match) return { year: match[1], month: match[2].padStart(2, '0'), day: match[3].padStart(2, '0') };
  match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(trimmed);
  if (match) return { day: match[1].padStart(2, '0'), month: match[2].padStart(2, '0'), year: match[3] };
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length !== 8 || digits.length !== trimmed.length) return null;
  const isoFirst = { year: digits.slice(0, 4), month: digits.slice(4, 6), day: digits.slice(6, 8) };
  const dayFirst = { day: digits.slice(0, 2), month: digits.slice(2, 4), year: digits.slice(4, 8) };
  const plausibleYear = (year: string) => Number(year) >= 1900 && Number(year) <= 2100;
  if (plausibleYear(isoFirst.year) && !validateDateParts(isoFirst)) return isoFirst;
  return dayFirst;
}

export type DateLimits = { min?: string; max?: string; minMessage?: string; maxMessage?: string };

/** Returns a user-facing error, or null when the parts form a real calendar date within the limits. */
export function validateDateParts(parts: DateParts, limits: DateLimits = {}): string | null {
  if (!parts.day || !parts.month || !parts.year) return 'Enter the day, month and year.';
  if (!/^\d{1,2}$/.test(parts.day) || !/^\d{1,2}$/.test(parts.month) || !/^\d{4}$/.test(parts.year)) return 'Use numbers: DD / MM / YYYY.';
  const year = Number(parts.year), month = Number(parts.month), day = Number(parts.day);
  if (month < 1 || month > 12) return 'Month must be between 01 and 12.';
  if (day < 1 || day > daysInMonth(year, month)) return month === 2 && day === 29 ? `${year} is not a leap year.` : `This month has ${daysInMonth(year, month)} days.`;
  const iso = `${parts.year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (limits.min && iso < limits.min) return limits.minMessage ?? 'This date is too early.';
  if (limits.max && iso > limits.max) return limits.maxMessage ?? 'This date cannot be in the future.';
  return null;
}

/** Normalized ISO value for complete parts (pads day/month). */
export const isoFromParts = (parts: DateParts) => joinIsoDate({ year: parts.year, month: padDatePart('month', parts.month), day: padDatePart('day', parts.day) });

/** Display text for a stored ISO day in the app's DD/MM/YYYY order. */
export function formatDayMonthYear(iso: string) {
  const { day, month, year } = splitIsoDate(iso);
  return day && month && year ? `${day}/${month}/${year}` : iso;
}
