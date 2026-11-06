export function signupRequirements(missingFields: readonly string[], unverifiedFields: readonly string[]) {
  const missing = [...missingFields];
  const unverified = [...unverifiedFields];
  const supported = new Set(['first_name', 'last_name', 'username', 'legal_accepted']);
  return {
    missing,
    unverified,
    firstName: missing.includes('first_name'),
    lastName: missing.includes('last_name'),
    username: missing.includes('username'),
    legalAccepted: missing.includes('legal_accepted'),
    unsupported: missing.filter(field => !supported.has(field)),
  };
}

export function canFinalizeSignUp(status: string | null, missingFields: readonly string[], unverifiedFields: readonly string[]) {
  return status === 'complete' && missingFields.length === 0 && unverifiedFields.length === 0;
}
