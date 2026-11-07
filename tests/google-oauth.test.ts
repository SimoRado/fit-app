import { describe, expect, it } from 'vitest';
import { googleOAuthMessage, googleOAuthOutcome } from '../src/core/oauthErrors';

describe('Clerk Google OAuth cancellation and failure messaging', () => {
  it('distinguishes cancellation, closed browser, incomplete OAuth, and created session', () => {
    expect(googleOAuthOutcome('cancel', false)).toBe('cancelled');
    expect(googleOAuthOutcome('dismiss', false)).toBe('cancelled');
    expect(googleOAuthOutcome('locked', false)).toBe('browser-closed');
    expect(googleOAuthOutcome('success', false)).toBe('incomplete');
    expect(googleOAuthOutcome('success', true)).toBe('session-created');
  });
  it('does not surface a normal browser cancellation', () => {
    expect(googleOAuthMessage({ code: 'SIGN_IN_CANCELLED' })).toBeNull();
    expect(googleOAuthMessage(new Error('Browser dismissed'))).toBeNull();
  });
  it('reports connection and callback failures without leaking technical details', () => {
    expect(googleOAuthMessage(new Error('network unavailable'))).toMatch(/Connection unavailable/);
    expect(googleOAuthMessage(new Error('redirect configuration invalid'))).toMatch(/redirect setup/);
    expect(googleOAuthMessage(new Error('private token: abc'))).not.toContain('abc');
  });
});
