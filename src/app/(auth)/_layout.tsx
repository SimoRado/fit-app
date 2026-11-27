import { Stack } from 'expo-router';
import { useStackAnimation } from '../../ui/motion';
export default function AuthLayout() { const stackAnimation = useStackAnimation(); return <Stack screenOptions={{ headerShown: false, ...stackAnimation }}/>; }
