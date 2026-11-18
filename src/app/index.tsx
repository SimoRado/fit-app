import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useApp } from '../state/app';
import { colors } from '../ui/theme';
import { authDiagnostic } from '../core/runtime';
import { accessDestination } from '../core/accessGate';
import { dayKey } from '../core/date';
import { useConvexAuth, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { TERMS_VERSION } from '../../shared/legalVersions';
export default function Index() { const {ready,profile,legalAccepted,ageRejected}=useApp(); const {isAuthenticated}=useConvexAuth(); const remote=useQuery(api.eligibility.current,isAuthenticated?{}:'skip'); const destination = accessDestination({ birthDate: profile?.birth_date, hasProfile: Boolean(profile), ageRejected, legalAccepted, serverRecorded: remote?.acceptedAt != null, serverAdult: remote?.adult === true, serverTermsAccepted: remote?.termsVersion === TERMS_VERSION, serverRejected: remote?.rejected === true, today: dayKey() }); useEffect(() => { authDiagnostic('profile decision', { ready, destination: ready && isAuthenticated && remote !== undefined ? destination : 'waiting' }, 'NAVIGATION'); }, [ready, isAuthenticated, remote, destination]); if(!ready || !isAuthenticated || remote === undefined) return <View style={{flex:1,justifyContent:'center'}}><ActivityIndicator color={colors.accent}/></View>; return <Redirect href={destination}/>; }
