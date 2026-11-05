import { describe, expect, it } from 'vitest';
import { dateParts, updateDatePart } from '../src/core/birthDate';
import { validateProfileValues } from '../src/core/validation';

const profile = (birth_date: string) => ({ name: 'Amina El Idrissi', birth_date, height_cm: 170, start_weight: 70, target_weight: null });

describe('birthday entry and account profile validation', () => {
  it('splits an existing date for editing and preserves the date-only value', () => {
    expect(dateParts('2004-02-29')).toEqual({ year: '2004', month: '02', day: '29' });
    expect(updateDatePart('--', 'year', '2004')).toBe('2004--');
    expect(updateDatePart('2004--', 'month', '02')).toBe('2004-02-');
    expect(updateDatePart('2004-02-', 'day', '29')).toBe('2004-02-29');
    expect(updateDatePart('--', 'year', '2004-02-29')).toBe('2004-02-29');
  });
  it('accepts leap day and rejects impossible, future and out-of-range birthdays', () => {
    expect(validateProfileValues(profile('2004-02-29'), '2026-11-05').birth_date).toBe('2004-02-29');
    for (const birth of ['2003-02-29', '2004-13-01', '2027-01-01', '1900-01-01']) {
      expect(() => validateProfileValues(profile(birth), '2026-11-05')).toThrow();
    }
  });
});
