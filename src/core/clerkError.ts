export function clerkErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const item = error as { code?: unknown; errors?: { code?: string }[] };
  return item.errors?.[0]?.code ?? (typeof item.code === 'string' ? item.code : '');
}

export function clerkMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const item = error as { errors?: { code?: string; longMessage?: string; message?: string }[] };
    const code = clerkErrorCode(error);
    if (/form_identifier_not_found|form_password_incorrect|identifier_not_found/.test(code)) return 'Email or password is incorrect.';
    if (/form_identifier_exists|email_address_exists/.test(code)) return 'This email is already registered. Try signing in.';
    if (/strategy_for_user_invalid/.test(code)) return 'This account cannot use email and password in this Clerk environment. Use its original sign-in method, or create/sign in to the separate Development account.';
    if (/session_exists/.test(code)) return 'A sign-in session is already active. Return to the app, or sign out before trying a different account.';
    if (/form_code_incorrect/.test(code)) return 'That code is incorrect. Check it and try again.';
    if (/verification_expired|form_code_expired/.test(code)) return 'That code expired. Request a new one.';
    if (/password/.test(code)) return item.errors?.[0]?.longMessage ?? item.errors?.[0]?.message ?? 'Choose a stronger password.';
  }
  return 'Could not complete authentication. Check your connection and try again.';
}
