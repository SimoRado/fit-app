/** Calendar-only age check. February 29 birthdays mature on March 1 in non-leap years. */
export function ageOnDay(birthDate: string | null | undefined, today: string): number | null {
  const parts = (value: string | null | undefined) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() + 1 === month && parsed.getUTCDate() === day
      ? { year, month, day } : null;
  };
  const birth = parts(birthDate), current = parts(today);
  if (!birth || !current || birthDate! > today) return null;
  const age = current.year - birth.year -
    (current.month < birth.month || (current.month === birth.month && current.day < birth.day) ? 1 : 0);
  return age >= 0 ? age : null;
}

export function adultOnDay(birthDate: string | null | undefined, today: string): boolean {
  const age = ageOnDay(birthDate, today);
  return age !== null && age >= 18;
}
