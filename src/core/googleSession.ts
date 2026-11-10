export function clerkGateState(isLoaded: boolean, isSignedIn: boolean | undefined, userId: string | null | undefined) {
  if (!isLoaded) return 'loading';
  return isSignedIn && userId ? 'signed-in' : 'signed-out';
}

export async function activateClerkSession(result: {
  createdSessionId: string | null;
  setActive?: ((params: { session: string }) => Promise<unknown>) | null;
}) {
  if (!result.createdSessionId || !result.setActive) return false;
  await result.setActive({ session: result.createdSessionId });
  return true;
}

export const activateGoogleSession = activateClerkSession;
