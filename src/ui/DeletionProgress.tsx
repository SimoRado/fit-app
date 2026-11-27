import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useVoltTheme } from './VoltThemeProvider';

export function DeletionProgress({ receipt, signedIn, cleanupError }: { receipt: string | null; signedIn: boolean; cleanupError: string | null }) {
  const { palette } = useVoltTheme();
  const { isAuthenticated } = useConvexAuth();
  const [clerkStageSeen, setClerkStageSeen] = React.useState(false);
  const [lastStage, setLastStage] = React.useState<string | null>(null);
  const status = useQuery(api.accountDeletion.status, signedIn && isAuthenticated && receipt && !clerkStageSeen ? { receipt } : 'skip');
  React.useEffect(() => { if (status?.stage === 'clerk_pending' || status?.stage === 'completed') { setLastStage(status.stage); setClerkStageSeen(true); } }, [status?.stage]);
  const retry = useMutation(api.accountDeletion.retry);
  const [retryError, setRetryError] = React.useState<string | null>(null);
  const stage = status?.stage ?? (clerkStageSeen ? lastStage : null);
  const detail = cleanupError ?? retryError ?? (stage === 'completed'
    ? 'Cloud deletion is complete. Finishing cleanup on this device.'
    : stage === 'retry_required'
      ? 'A service could not finish deletion. The server will retry automatically. Your account remains locked against normal activity.'
      : stage === 'revenuecat_pending'
        ? 'Cloud data was removed. Waiting for subscription service confirmation.'
        : stage === 'clerk_pending'
          ? 'Subscription service confirmed. Removing the sign-in identity.'
          : stage === 'cloud_pending'
            ? 'Removing account data from the cloud.'
          : status === null
            ? 'The saved receipt does not match a server job yet. Keep this device connected. If this persists, contact support before making another request.'
            : 'Checking deletion status. Keep this device connected; the server continues processing if you close the app.');
  return <View style={{ flex: 1, backgroundColor: palette.bg, justifyContent: 'center', padding: 28, gap: 18 }}>
    <ActivityIndicator color={palette.accent}/>
    <Text style={{ color: palette.text, fontSize: 25, fontWeight: '700' }}>{stage ? 'Account deletion in progress' : 'Checking account deletion'}</Text>
    <Text style={{ color: palette.muted, fontSize: 16, lineHeight: 24 }}>{detail}</Text>
    {stage === 'retry_required' && signedIn && isAuthenticated && <Pressable accessibilityRole="button" onPress={() => { setRetryError(null); void retry({}).catch(() => setRetryError('Could not request an immediate retry. The server will retry automatically.')); }} style={{ padding: 14, backgroundColor: palette.accent, borderRadius: 14, alignSelf: 'flex-start' }}><Text style={{ color: palette.accentText, fontWeight: '700' }}>Retry now</Text></Pressable>}
    {status?.errorCategory && <Text style={{ color: palette.muted }}>Service status: {status.errorCategory.replace(/_/g, ' ')}</Text>}
  </View>;
}
