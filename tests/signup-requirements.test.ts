import { describe, expect, it } from 'vitest';
import { canFinalizeSignUp, signupRequirements } from '../src/core/signupRequirements';

describe('Clerk signup requirements', () => {
  it('collects only fields Clerk reports as missing', () => {
    const result = signupRequirements(['first_name', 'last_name'], []);
    expect(result.firstName).toBe(true);
    expect(result.lastName).toBe(true);
    expect(result.username).toBe(false);
    expect(result.unsupported).toEqual([]);
  });
  it('keeps unknown requirements visible instead of finalizing', () => {
    const result = signupRequirements(['phone_number'], ['email_address']);
    expect(result.unsupported).toEqual(['phone_number']);
    expect(result.unverified).toEqual(['email_address']);
  });
  it('never activates an incomplete signup', () => {
    expect(canFinalizeSignUp('missing_requirements', ['first_name'], [])).toBe(false);
    expect(canFinalizeSignUp('complete', [], ['email_address'])).toBe(false);
    expect(canFinalizeSignUp('complete', [], [])).toBe(true);
  });
});
