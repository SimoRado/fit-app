import { describe, expect, it } from 'vitest';
import { allowsClerkPublishableKey } from '../src/core/productionConfig';

describe('production credential configuration', () => {
  it('rejects Clerk test keys in distributable release builds', () => {
    expect(allowsClerkPublishableKey('pk_test_example', false, false)).toBe(false);
    expect(allowsClerkPublishableKey('pk_live_example', false, false)).toBe(true);
  });

  it('continues to allow development and explicitly marked internal builds', () => {
    expect(allowsClerkPublishableKey('pk_test_example', true, false)).toBe(true);
    expect(allowsClerkPublishableKey('pk_test_example', false, true)).toBe(true);
  });
});
