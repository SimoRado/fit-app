import type { Style } from '../ui/theme';

export type PaywallAppearance = 'light' | 'dark';
export type PaywallHeroKey = 'voltLight' | 'voltDark' | 'lotusLight' | 'lotusDark';

const heroKeys: Record<Style, Record<PaywallAppearance, PaywallHeroKey>> = {
  volt: { light: 'voltLight', dark: 'voltDark' },
  lotus: { light: 'lotusLight', dark: 'lotusDark' },
};

/** Select artwork from the already-resolved app theme, independent of profile sex. */
export function paywallHeroKey(style: Style, appearance: PaywallAppearance): PaywallHeroKey {
  return heroKeys[style][appearance];
}
