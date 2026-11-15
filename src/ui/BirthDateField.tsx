import React from 'react';
import { dayKey } from '../core/date';
import { DateField } from './DateField';

/** Date of birth in Day / Month / Year order with automatic focus movement; stored as YYYY-MM-DD. */
export function BirthDateField({ value, onChangeText }: { value: string; onChangeText: (value: string) => void }) {
  return <DateField label="Date of birth" value={value} onChange={onChangeText} autoComplete="birthdate-full"
    limits={{ min: '1900-01-01', max: dayKey(), minMessage: 'Enter a birth year from 1900 onward.', maxMessage: 'Date of birth cannot be in the future.' }}/>;
}
