export function googleOAuthOutcome(browserResult: string | null, hasSession: boolean) {
  if (hasSession) return 'session-created';
  if (browserResult === 'cancel' || browserResult === 'dismiss') return 'cancelled';
  if (browserResult === 'success') return 'incomplete';
  return 'browser-closed';
}

export function googleOAuthMessage(cause: unknown): string | null {
  const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : '';
  const detail = cause instanceof Error ? cause.message : '';
  if (['SIGN_IN_CANCELLED', '-5', 'ERR_REQUEST_CANCELED'].includes(code) || /cancelled|canceled|dismissed/i.test(detail)) return null;
  if (/network|offline|connection/i.test(detail)) return 'Connection unavailable. Check your internet and try again.';
  if (/redirect|callback|configuration/i.test(detail)) return 'Google sign-in could not return to Fitapp. Check the Clerk redirect setup.';
  return 'Google sign-in could not be completed. Please try again.';
}
