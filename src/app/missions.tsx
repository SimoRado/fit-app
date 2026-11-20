import { Redirect } from 'expo-router';

/** Retired feature: preserve old links without mounting the former screen or its data reads. */
export default function Missions() {
  return <Redirect href="/(tabs)/progress" />;
}
