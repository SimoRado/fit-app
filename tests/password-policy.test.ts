import { describe, expect, it } from 'vitest';
import { passwordPolicyMessage, passwordRequirements } from '../src/core/passwordPolicy';

describe('email password policy', () => {
  it('accepts eight characters with uppercase and a special character', () => {
    expect(passwordPolicyMessage('Abcdef!1')).toBeNull();
    expect(passwordPolicyMessage('A!      ')).toBeNull();
    expect(passwordPolicyMessage('A!'.padEnd(200, 'x'))).toBeNull();
  });
  it('reports only missing requirements', () => {
    expect(passwordPolicyMessage('Abcdef!')).toContain('8 or more');
    expect(passwordPolicyMessage('abcdefgh!')).toContain('uppercase');
    expect(passwordPolicyMessage('Abcdefgh')).toContain('special');
    expect(passwordRequirements).toHaveLength(3);
  });
});
