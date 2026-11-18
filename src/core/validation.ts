import { z } from 'zod';
import { dayKey, validDay } from './date';
import { ageOnDay } from '../../shared/ageEligibility';

const profileSchema = z.object({
  name: z.string().trim().min(1),
  birth_date: z.string().refine(validDay),
  height_cm: z.number().finite().min(80).max(250),
  start_weight: z.number().finite().min(20).max(500),
  target_weight: z.number().finite().min(20).max(500).nullable(),
});

export type ProfileValues = z.infer<typeof profileSchema>;
export function validateProfileValues(input: unknown, today = dayKey()): ProfileValues {
  const profile = profileSchema.parse(input);
  const age = ageOnDay(profile.birth_date, today);
  if (age === null) throw new Error('Enter a valid date of birth.');
  if (age < 18) throw new Error('Cubyfit is for adults aged 18 and older.');
  return profile;
}
