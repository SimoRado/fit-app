export function dateParts(value: string) {
  const [year = '', month = '', day = ''] = value.split('-');
  return { year, month, day };
}
export function updateDatePart(value: string, part: 'year' | 'month' | 'day', input: string) {
  const digits = input.replace(/\D/g, '');
  const pasted = digits.length === 8 ? { year: digits.slice(0, 4), month: digits.slice(4, 6), day: digits.slice(6, 8) } : null;
  const parts = pasted ?? { ...dateParts(value), [part]: digits.slice(0, part === 'year' ? 4 : 2) };
  return `${parts.year}-${parts.month}-${parts.day}`;
}
