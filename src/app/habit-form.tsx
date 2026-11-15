import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';

/**
 * Habits are created and edited in the Volt "New habit" sheet on the Habits
 * tab. This route keeps existing links working (Home "Add your first habit",
 * Progress empty state) by handing over to that sheet.
 */
export default function HabitForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  useEffect(() => {
    router.replace({ pathname: '/(tabs)/habits', params: id ? { edit: id } : { new: '1' } });
  }, [id]);
  return null;
}
