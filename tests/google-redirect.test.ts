import { describe, expect, it } from 'vitest';
import { googleRedirect } from '../src/core/googleRedirect';

describe('Google browser return URI', () => {
  it('uses the configured native scheme and exact callback when Expo agrees', () => {
    const redirect = googleRedirect('betterday', options => options.native);
    expect(redirect).toEqual({ url: 'betterday://oauth-callback', generatedMatches: true });
  });
  it('does not send a Metro host URI to Clerk if Expo returns one', () => {
    const redirect = googleRedirect('betterday', () => 'betterday://192.168.1.5:8081/oauth-callback');
    expect(redirect.url).toBe('betterday://oauth-callback');
    expect(redirect.generatedMatches).toBe(false);
  });
  it('rejects an absent or malformed scheme', () => {
    expect(() => googleRedirect(undefined, () => '')).toThrow(/configuration/);
    expect(() => googleRedirect('bad scheme', () => '')).toThrow(/configuration/);
  });
});
