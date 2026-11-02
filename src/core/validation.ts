import { z } from 'zod';
import { dayKey, fromDay, validDay } from './date';

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
  if (profile.birth_date >= today) throw new Error('Enter a valid date of birth for someone aged 0–120.');
  const birth = fromDay(profile.birth_date), current = fromDay(today);
  const age = current.getFullYear() - birth.getFullYear() - (current.getMonth() < birth.getMonth() || (current.getMonth() === birth.getMonth() && current.getDate() < birth.getDate()) ? 1 : 0);
  if (age > 120) throw new Error('Enter a valid date of birth for someone aged 0–120.');
  return profile;
}
