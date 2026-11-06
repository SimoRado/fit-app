import { describe, expect, it } from 'vitest';
import { isCompleteEmailCode, normalizeEmailCode } from '../src/core/emailCode';

describe('six-cell email verification code', () => {
  it('accepts typing and a pasted code without submitting extra characters', () => {
    expect(normalizeEmailCode('1')).toBe('1');
    expect(normalizeEmailCode('12 34-56')).toBe('123456');
    expect(normalizeEmailCode('123456789')).toBe('123456');
  });
  it('does not allow a partial code to be submitted', () => {
    expect(isCompleteEmailCode('12345')).toBe(false);
    expect(isCompleteEmailCode('123456')).toBe(true);
  });
});
