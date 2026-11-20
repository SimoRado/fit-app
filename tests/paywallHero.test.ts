import { describe, expect, it } from 'vitest';
import { paywallHeroKey } from '../src/services/paywallHero';
import { resolveStyle } from '../src/ui/theme';

describe('paywall hero artwork mapping', () => {
  it('selects the matching Volt and Lotus image for each appearance', () => {
    expect(paywallHeroKey('volt', 'light')).toBe('voltLight');
    expect(paywallHeroKey('volt', 'dark')).toBe('voltDark');
    expect(paywallHeroKey('lotus', 'light')).toBe('lotusLight');
    expect(paywallHeroKey('lotus', 'dark')).toBe('lotusDark');
  });

  it('follows the resolved Match my profile style and respects manual overrides', () => {
    expect(paywallHeroKey(resolveStyle('profile', 'female'), 'light')).toBe('lotusLight');
    expect(paywallHeroKey(resolveStyle('profile', 'male'), 'dark')).toBe('voltDark');
    expect(paywallHeroKey(resolveStyle('lotus', 'male'), 'dark')).toBe('lotusDark');
    expect(paywallHeroKey(resolveStyle('volt', 'female'), 'light')).toBe('voltLight');
  });
});
