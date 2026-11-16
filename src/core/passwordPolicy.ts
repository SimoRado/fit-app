export const passwordRequirements = [
  { label: '8 or more characters', test: (value: string) => value.length >= 8 },
  { label: 'One uppercase letter', test: (value: string) => /[A-Z]/.test(value) },
  { label: 'One special character', test: (value: string) => /[!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~]/.test(value) },
] as const;

export function passwordPolicyMessage(value: string) {
  const missing = passwordRequirements.filter(requirement => !requirement.test(value));
  return missing.length ? `Password needs ${missing.map(item => item.label.toLowerCase()).join(', ')}.` : null;
}
