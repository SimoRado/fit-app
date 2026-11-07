import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useApp } from '../state/app';
import { colors } from '../ui/theme';
import { authDiagnostic } from '../core/runtime';
export default function Index() { const {ready,profile}=useApp(); useEffect(() => { authDiagnostic('profile decision', { ready, destination: ready ? profile ? 'dashboard' : 'onboarding' : 'waiting' }, 'NAVIGATION'); }, [ready, profile]); if(!ready) return <View style={{flex:1,justifyContent:'center'}}><ActivityIndicator color={colors.accent}/></View>; return <Redirect href={profile?'/(tabs)':'/onboarding'}/>; }
