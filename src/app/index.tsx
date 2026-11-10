import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useApp } from '../state/app';
import { colors } from '../ui/theme';
import { authDiagnostic } from '../core/runtime';
import { profileDestination } from '../core/profileDestination';
export default function Index() { const {ready,profile}=useApp(); const destination = profileDestination(Boolean(profile)); useEffect(() => { authDiagnostic('profile decision', { ready, destination: ready ? destination === '/(tabs)' ? 'dashboard' : 'onboarding' : 'waiting' }, 'NAVIGATION'); }, [ready, destination]); if(!ready) return <View style={{flex:1,justifyContent:'center'}}><ActivityIndicator color={colors.accent}/></View>; return <Redirect href={destination}/>; }
