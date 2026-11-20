import { Redirect } from 'expo-router';

/** Retired feature: preserve old create/edit links without exposing the form. */
export default function MissionForm() {
  return <Redirect href="/(tabs)/progress" />;
}
