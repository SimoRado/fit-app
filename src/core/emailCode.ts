/** Keep the six visible OTP cells and the submitted Clerk code in sync. */
export function normalizeEmailCode(input: string): string {
  return input.replace(/\D/g, '').slice(0, 6);
}

export function isCompleteEmailCode(input: string): boolean {
  return /^\d{6}$/.test(input);
}
