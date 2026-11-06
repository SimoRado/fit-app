/** V4 Bloom design tokens from the final prototype overrides. */
export const colors = {
  bg: '#FBF7EF', card: '#FFFFFF', card2: '#F2ECDE', elevated: '#E7DFCB',
  text: '#1E1B2E', muted: '#6A6680', subtle: '#9A96AD',
  accent: '#6B4DF5', accentText: '#FFFFFF', danger: '#C0392B',
  border: '#EEE7D8', borderStrong: '#E0D7C3', line3: '#BDB4D2',
  sun: '#FFC83D', coral: '#FF7B5C', lilac: '#D9CFFF', mint: '#A8E6CF', sky: '#B5DBFF', ink: '#1E1B2E',
} as const;
export const spacing = { xs: 4, sm: 8, md: 12, base: 16, card: 20, screen: 20, section: 32, major: 40 } as const;
export const radii = { small: 16, input: 20, card: 28, large: 38, pill: 999 } as const;
export const shadows = { card: { shadowColor: '#46328C', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 3 }, elevation: 2 }, dock: { shadowColor: '#46328C', shadowOpacity: 0.2, shadowRadius: 32, shadowOffset: { width: 0, height: 12 }, elevation: 10 } } as const;
export const fonts = { display: 'FitDisplay', displayHeavy: 'FitDisplayHeavy', body: 'FitBody', medium: 'FitBodyMedium', semibold: 'FitBodySemiBold', bold: 'FitBodyBold', mono: 'FitBodySemiBold', arabic: 'FitArabic', arabicBold: 'FitArabicBold' } as const;
