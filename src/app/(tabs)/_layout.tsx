import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../state/app';
import { t } from '../../core/i18n';
import { colors } from '../../ui/theme';
export default function Layout() { const lang=useApp().language; const items=[['index','home','home-outline'],['habits','habits','checkbox-outline'],['workouts','workouts','barbell-outline'],['progress','progress','stats-chart-outline'],['profile','profile','person-outline']] as const; return <Tabs screenOptions={{headerShown:false,tabBarStyle:{backgroundColor:colors.card,borderTopColor:colors.border,direction:lang==='ar'?'rtl':'ltr'},tabBarActiveTintColor:colors.accent,tabBarInactiveTintColor:colors.muted}}>{items.map(([name,label,icon])=><Tabs.Screen key={name} name={name} options={{title:t(lang,label),tabBarIcon:({color,size})=><Ionicons name={icon} color={String(color)} size={size}/>}}/>)}</Tabs>; }
