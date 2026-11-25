export type Appearance = 'shore' | 'deep' | 'abyss';
/** Colour style. Independent of Appearance (light/dark): Volt Light, Volt Dark, Lotus Light, Lotus Dark. */
export type Style = 'volt' | 'lotus';
/** What the user picked in Personalization. 'profile' follows the profile's sex (male → Volt, female → Lotus); it is only a visual default. */
export type StyleMode = 'profile' | Style;

/** A multi-stop gradient: colors with offsets in 0..1. */
export type GradientStops = readonly { offset: number; color: string; opacity?: number }[];

export type Palette = {
  /** True for the light (Shore) appearance. Use this instead of comparing `bg` to a hex. */
  light: boolean;
  style: Style;
  bg: string;
  card: string;
  card2: string;
  elevated: string;
  text: string;
  muted: string;
  subtle: string;
  accent: string;
  accentText: string;
  accentInk: string;
  titleAccent: string;
  danger: string;
  dangerText: string;
  dangerSoft: string;
  border: string;
  borderStrong: string;
  line3: string;
  lime: string;
  blue: string;
  paleBlue: string;
  ice: string;
  softLime: string;
  navBackground: string;
  navActiveBackground: string;
  navActiveText: string;
  navActiveIcon: string;
  softLimeText: string;
  chartTrack: string;
  surfaceWarm: string;
  /** Prototype tokens (final effective appearance values). */
  q1: string; q2: string; q3: string; qTrack: string; qCore: string;
  c8: string; c8Line: string; soft1: string; soft2: string; chipBg: string; chipFg: string;
  g1: string; g2: string; plInk: string; plGlow: string;
  hsRim: string; hsTrack: string; hsDot: string; hsIb: string; hsIc: string;
  /** Page background line art (prototype `--pat-c` / `--pat-o`). */
  pattern: string; patternOpacity: number;
  mc1: string; mb1: string; mc2: string; mb2: string; mc3: string; mb3: string; mbt: string;
  lv1: string; lv2: string; lv3: string; lgi: string;
  pgBar: string; pgHl: string; pgSoft: string; pgUp: string;
  heroCard: string; navShadow: string;
  /** Lotus additions (prototype `html.x-f`). */
  /** `--lt-candy`: selected pills, active tab, accent buttons. */
  candy: GradientStops;
  /** Selected day pills (Volt: navy → indigo at 165°; Lotus: candy at 135°). */
  pill: GradientStops; pillAngle: number;
  /** Text/icon colour drawn on `candy`. */
  candyInk: string;
  /** `--lt-glow`: coloured drop shadow under candy surfaces. */
  candyGlow: string;
  /** `--lt-hero`: the Progress weight card and other hero surfaces. */
  hero: GradientStops;
  heroShadow: string;
  /** `.chip8` gradient + ink. */
  chipStops: GradientStops; chipInk: string;
  /** `.sc8b` round quick-action buttons. */
  orbFrom: string; orbTo: string; orbRing: string; orbIcon: string;
  /** Outer drop shadow / glow under the `.sc8b` orb (the inset ring is drawn from `orbRing`). */
  orbGlow: string;
  /** Loading placeholder surface: a soft, low-contrast tint that sits on both `bg` and `c8`. */
  skeleton: string;
  /** Card drop shadow colour (`rgba(73,16,139,.16)` in Shore). */
  cardShadow: string;
  /** Header glows painted on the page (`.viewport` radial gradients). */
  glowA: string; glowB: string;
  /** Weight detail chart area fill (`--k-5C9BD6`). */
  chartFill: string;
  // Compatibility names used by existing screens while they are migrated.
  sun: string;
  coral: string;
  lilac: string;
  mint: string;
  sky: string;
  ink: string;
};

const brandSets = {
  // Lotus: from the designer's final prototype (Cubyfit-VoltVFinal.html, html.x-f).
  lotus: { ink: '#2A0950', indigo: '#49108B', violet: '#7E30E1', purple: '#B04FE4', orchid: '#E26EE5', lavender: '#B98AF0', lilac: '#E6D6FA', mist: '#F1EBFC', blush: '#FBE4FB', snow: '#F3F8FF', white: '#FFFFFF', night: '#12061F', nightCard: '#1C0B30', nightRaised: '#261041' },
  // Volt: the original Cubyfit colours these names replaced.
  volt: { ink: '#0B1446', indigo: '#0B1446', violet: '#1D2E8F', purple: '#16206B', orchid: '#DFFF1F', lavender: '#9CCBFF', lilac: '#C9E3FF', mist: '#EEF6FF', blush: '#F6FFC2', snow: '#F5F9FF', white: '#FFFFFF', night: '#000000', nightCard: '#0B0E1A', nightRaised: '#141A2E' },
} as const;
export type BrandColors = { readonly [K in keyof typeof brandSets.lotus]: string };

let activeStyle: Style = 'volt';
/**
 * Named brand colours for fixed artwork (share cards, logo, illustrations) that
 * do not follow light/dark. Each name resolves to the active style's colour:
 * ink, violet, orchid… are navy, blue and volt in Volt; deep violet, violet and orchid in Lotus.
 */
export const brand = {} as BrandColors;
for (const key of Object.keys(brandSets.lotus) as (keyof BrandColors)[]) Object.defineProperty(brand, key, { enumerable: true, get: () => brandSets[activeStyle][key] });
export const brandFor = (style: Style): BrandColors => brandSets[style];

/** `rgba()` from a `#RRGGBB` colour. */
export function alpha(hex: string, opacity: number) {
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${opacity})`;
}

const candyLight: GradientStops = [{ offset: 0, color: '#7E30E1' }, { offset: 0.55, color: '#B04FE4' }, { offset: 1, color: '#E26EE5' }];
const candyDark: GradientStops = [{ offset: 0, color: '#E26EE5' }, { offset: 1, color: '#B887F5' }];
// `linear-gradient(140deg,#49108B 0%,#7E30E1 55%,#E26EE5 115%)`: the 100% colour is interpolated (#C95EE4).
const hero: GradientStops = [{ offset: 0, color: '#49108B' }, { offset: 0.55, color: '#7E30E1' }, { offset: 1, color: '#C95EE4' }];

const solid = (color: string, opacity?: number): GradientStops => [{ offset: 0, color, opacity }, { offset: 1, color, opacity }];

const palettes: Record<Style, Record<Appearance, Palette>> = {
  // Original Cubyfit Volt (navy, sky and volt), restored verbatim from commit a17d83b.
  volt: {

    shore: {
      light: true, style: 'volt', dangerSoft: '#FDECEA',
      candy: solid('#1D2E8F'), candyInk: '#FFFFFF', candyGlow: 'rgba(29,46,143,0.28)', pill: [{ offset: 0, color: '#0B1446' }, { offset: 1, color: '#1D2E8F' }], pillAngle: 165,
      hero: solid('#1D2E8F'), heroShadow: '#0B1446',
      chipStops: solid('#F6FFC2'), chipInk: '#1D2E8F',
      orbFrom: '#FFFFFF', orbTo: '#EEF6FF', orbRing: '#9CCBFF', orbIcon: '#1D2E8F', orbGlow: '0px 8px 18px -10px rgba(29,46,143,0.45)', skeleton: '#E4ECF8',
      cardShadow: '#0B1446', glowA: 'transparent', glowB: 'transparent', chartFill: '#1D2E8F',
      bg: '#F5F9FF', card: '#FFFFFF', card2: '#EEF6FF', elevated: '#DDEAFB',
      text: '#0B1446', muted: '#4A5679', subtle: '#5F6A8C',
      accent: '#1D2E8F', accentText: '#FFFFFF', accentInk: '#0B1446', titleAccent: '#1D2E8F', danger: '#B42318', dangerText: '#FFFFFF',
      border: '#E3ECF8', borderStrong: '#CCDAEE', line3: '#8796B8',
      lime: '#DFFF1F', blue: '#9CCBFF', paleBlue: '#C9E3FF', ice: '#EEF6FF', softLime: '#F6FFC2',
      navBackground: '#FFFFFF', navActiveBackground: '#1D2E8F', navActiveText: '#FFFFFF', navActiveIcon: '#DFFF1F', softLimeText: '#0B1446',
      chartTrack: '#E3ECFA', surfaceWarm: '#F6FFC2',
      q1: '#1D2E8F', q2: '#9CCBFF', q3: '#DFFF1F', qTrack: '#EEF6FF', qCore: '#F5F9FF',
      c8: '#FFFFFF', c8Line: '#E4EEFB', soft1: '#EEF6FF', soft2: '#F6FFC2', chipBg: '#F6FFC2', chipFg: '#1D2E8F',
      g1: '#1D2E8F', g2: '#0B1446', plInk: '#FFFFFF', plGlow: 'rgba(29,46,143,0.28)',
      hsRim: '#C9E3FF', hsTrack: '#FFFFFF', hsDot: '#9CCBFF', hsIb: '#DFFF1F', hsIc: '#1D2E8F',
      pattern: '#1D2E8F', patternOpacity: 0.08,
      mc1: '#EEF6FF', mb1: '#1D2E8F', mc2: '#F6FFC2', mb2: '#1D2E8F', mc3: '#E3F1FF', mb3: '#9CCBFF', mbt: 'rgba(255,255,255,0.85)',
      lv1: '#C9E3FF', lv2: '#9CCBFF', lv3: '#1D2E8F', lgi: '#F1F5FC',
      pgBar: '#1D2E8F', pgHl: '#DFFF1F', pgSoft: 'rgba(29,46,143,0.08)', pgUp: '#1D2E8F',
      heroCard: '#1D2E8F', navShadow: '#0B1446',
      sun: '#DFFF1F', coral: '#9CCBFF', lilac: '#C9E3FF', mint: '#F6FFC2', sky: '#EEF6FF', ink: '#0B1446',
    },
    abyss: {
      light: false, style: 'volt', dangerSoft: 'rgba(255,138,138,0.12)',
      candy: solid('#DFFF1F'), candyInk: '#0B1446', candyGlow: 'rgba(223,255,31,0.25)', pill: [{ offset: 0, color: '#9CCBFF' }, { offset: 1, color: '#DFFF1F' }], pillAngle: 165,
      hero: solid('#1A2A80'), heroShadow: '#000000',
      chipStops: solid('#DFFF1F', 0.14), chipInk: '#DFFF1F',
      orbFrom: '#1E2642', orbTo: '#0B0E1A', orbRing: '#9CCBFF', orbIcon: '#9CCBFF', orbGlow: '0px 0px 16px -4px rgba(156,203,255,0.3)', skeleton: '#161C30',
      cardShadow: '#000000', glowA: 'transparent', glowB: 'transparent', chartFill: '#9CCBFF',
      bg: '#000000', card: '#0B0E1A', card2: '#141A2E', elevated: '#1E2642',
      text: '#EEF6FF', muted: '#A8B0C8', subtle: '#7E87A3',
      accent: '#9CCBFF', accentText: '#0B1446', accentInk: '#0B1446', titleAccent: '#DFFF1F', danger: '#FF8A8A', dangerText: '#0B1446',
      border: '#151B30', borderStrong: '#252D4A', line3: '#454F75',
      lime: '#DFFF1F', blue: '#9CCBFF', paleBlue: '#C9E3FF', ice: '#1E2642', softLime: 'rgba(223,255,31,0.1)',
      navBackground: '#0B0E1A', navActiveBackground: '#DFFF1F', navActiveText: '#0B1446',
      chartTrack: 'rgba(255,255,255,0.08)', surfaceWarm: 'rgba(223,255,31,0.1)',
      q1: '#DFFF1F', q2: '#9CCBFF', q3: '#C9E3FF', qTrack: 'rgba(255,255,255,0.08)', qCore: 'rgba(255,255,255,0.03)',
      c8: '#0B0E1A', c8Line: 'rgba(255,255,255,0.06)', soft1: 'rgba(156,203,255,0.12)', soft2: 'rgba(223,255,31,0.1)', chipBg: 'rgba(223,255,31,0.14)', chipFg: '#DFFF1F',
      g1: '#DFFF1F', g2: '#9CCBFF', plInk: '#0B1446', plGlow: 'rgba(223,255,31,0.25)',
      hsRim: '#1E2642', hsTrack: '#141A2E', hsDot: '#454F75', hsIb: '#1E2642', hsIc: '#DFFF1F',
      pattern: '#9CCBFF', patternOpacity: 0.05,
      mc1: 'rgba(156,203,255,0.14)', mb1: '#9CCBFF', mc2: 'rgba(223,255,31,0.12)', mb2: '#DFFF1F', mc3: 'rgba(201,227,255,0.1)', mb3: '#C9E3FF', mbt: 'rgba(255,255,255,0.1)',
      lv1: 'rgba(156,203,255,0.45)', lv2: '#9CCBFF', lv3: '#DFFF1F', lgi: 'rgba(255,255,255,0.03)',
      pgBar: '#9CCBFF', pgHl: '#DFFF1F', pgSoft: 'rgba(156,203,255,0.1)', pgUp: '#DFFF1F',
      heroCard: '#1A2A80', navShadow: '#000000',
      sun: '#DFFF1F', coral: '#9CCBFF', lilac: '#1E2642', mint: '#9CCBFF', sky: '#141A2E', ink: '#EEF6FF',
      navActiveIcon: '#0B1446', softLimeText: '#DFFF1F',
    },
    deep: {
      light: false, style: 'volt', dangerSoft: 'rgba(255,138,138,0.12)',
      candy: solid('#DFFF1F'), candyInk: '#0B1446', candyGlow: 'rgba(223,255,31,0.25)', pill: [{ offset: 0, color: '#9CCBFF' }, { offset: 1, color: '#DFFF1F' }], pillAngle: 165,
      hero: solid('#22379F'), heroShadow: '#000000',
      chipStops: solid('#DFFF1F', 0.14), chipInk: '#DFFF1F',
      orbFrom: '#252F66', orbTo: '#121A3D', orbRing: '#9CCBFF', orbIcon: '#9CCBFF', orbGlow: '0px 0px 16px -4px rgba(156,203,255,0.3)', skeleton: '#1E274E',
      cardShadow: '#000000', glowA: 'transparent', glowB: 'transparent', chartFill: '#9CCBFF',
      bg: '#0A0E26', card: '#121A3D', card2: '#1A2350', elevated: '#252F66',
      text: '#EEF6FF', muted: '#A9B3DA', subtle: '#8691C2',
      accent: '#9CCBFF', accentText: '#0B1446', accentInk: '#0B1446', titleAccent: '#DFFF1F', danger: '#FF8A8A', dangerText: '#0B1446',
      border: '#1B2350', borderStrong: '#2A3470', line3: '#4B5594',
      lime: '#DFFF1F', blue: '#9CCBFF', paleBlue: '#C9E3FF', ice: '#1A2350', softLime: 'rgba(223,255,31,0.12)',
      navBackground: '#121A3D', navActiveBackground: '#DFFF1F', navActiveText: '#0B1446',
      chartTrack: 'rgba(255,255,255,0.1)', surfaceWarm: 'rgba(223,255,31,0.12)',
      q1: '#DFFF1F', q2: '#9CCBFF', q3: '#C9E3FF', qTrack: 'rgba(255,255,255,0.08)', qCore: 'rgba(255,255,255,0.03)',
      c8: '#121A3D', c8Line: 'rgba(255,255,255,0.06)', soft1: 'rgba(156,203,255,0.12)', soft2: 'rgba(223,255,31,0.1)', chipBg: 'rgba(223,255,31,0.14)', chipFg: '#DFFF1F',
      g1: '#DFFF1F', g2: '#9CCBFF', plInk: '#0B1446', plGlow: 'rgba(223,255,31,0.25)',
      hsRim: '#252F66', hsTrack: '#1A2350', hsDot: '#4B5594', hsIb: '#252F66', hsIc: '#DFFF1F',
      pattern: '#9CCBFF', patternOpacity: 0.075,
      mc1: 'rgba(156,203,255,0.14)', mb1: '#9CCBFF', mc2: 'rgba(223,255,31,0.12)', mb2: '#DFFF1F', mc3: 'rgba(201,227,255,0.1)', mb3: '#C9E3FF', mbt: 'rgba(255,255,255,0.1)',
      lv1: 'rgba(156,203,255,0.45)', lv2: '#9CCBFF', lv3: '#DFFF1F', lgi: 'rgba(255,255,255,0.03)',
      pgBar: '#9CCBFF', pgHl: '#DFFF1F', pgSoft: 'rgba(156,203,255,0.1)', pgUp: '#DFFF1F',
      heroCard: '#22379F', navShadow: '#000000',
      sun: '#DFFF1F', coral: '#9CCBFF', lilac: '#1A2350', mint: '#9CCBFF', sky: '#1A2350', ink: '#EEF6FF',
      navActiveIcon: '#0B1446', softLimeText: '#DFFF1F',
    },
  },
  // Lotus (indigo, violet and orchid), from the designer's final prototype (html.x-f).
  lotus: {
    shore: {
      light: true, style: 'lotus',
      bg: '#F3F8FF', card: '#FFFFFF', card2: '#F1EBFC', elevated: '#E8DCF8',
      text: '#2A0950', muted: '#5B5075', subtle: '#6E6588',
      accent: '#7E30E1', accentText: '#FFFFFF', accentInk: '#2A0950', titleAccent: '#7E30E1', danger: '#B42318', dangerText: '#FFFFFF', dangerSoft: '#FDECEA',
      border: '#ECE4F8', borderStrong: '#DAD5E9', line3: '#9990B4',
      lime: '#E26EE5', blue: '#B98AF0', paleBlue: '#E6D6FA', ice: '#F1EBFC', softLime: '#FBE4FB',
      navBackground: '#FFFFFF', navActiveBackground: '#7E30E1', navActiveText: '#FFFFFF', navActiveIcon: '#FFFFFF', softLimeText: '#2A0950',
      chartTrack: '#ECE9F8', surfaceWarm: '#FBE4FB',
      q1: '#7E30E1', q2: '#B98AF0', q3: '#E26EE5', qTrack: '#F1EBFC', qCore: '#F3F8FF',
      c8: '#FFFFFF', c8Line: '#ECE3F8', soft1: '#F1EBFC', soft2: '#FBE4FB', chipBg: '#FBE4FB', chipFg: '#7E30E1',
      g1: '#7E30E1', g2: '#49108B', plInk: '#FFFFFF', plGlow: 'rgba(126,48,225,0.34)',
      hsRim: '#E6D6FA', hsTrack: '#FFFFFF', hsDot: '#B98AF0', hsIb: '#E26EE5', hsIc: '#7E30E1',
      pattern: '#7E30E1', patternOpacity: 0.07,
      mc1: '#F1EBFC', mb1: '#7E30E1', mc2: '#FBE4FB', mb2: '#7E30E1', mc3: '#F3E9FE', mb3: '#B98AF0', mbt: 'rgba(255,255,255,0.85)',
      lv1: '#E6D6FA', lv2: '#B98AF0', lv3: '#7E30E1', lgi: '#F5F3FC',
      pgBar: '#7E30E1', pgHl: '#E26EE5', pgSoft: 'rgba(126,48,225,0.08)', pgUp: '#7E30E1',
      heroCard: '#7E30E1', navShadow: '#2A0950',
      candy: candyLight, pill: candyLight, pillAngle: 135, candyInk: '#FFFFFF', candyGlow: 'rgba(126,48,225,0.34)',
      hero, heroShadow: '#49108B',
      chipStops: [{ offset: 0, color: '#FBE4FB' }, { offset: 1, color: '#EFE3FD' }], chipInk: '#49108B',
      orbFrom: '#FFFFFF', orbTo: '#F1E6FD', orbRing: '#E26EE5', orbIcon: '#7E30E1', orbGlow: '0px 8px 18px -10px rgba(126,48,225,0.5)', skeleton: '#EFE8F8',
      cardShadow: '#49108B',
      glowA: 'rgba(226,110,229,0.16)', glowB: 'rgba(126,48,225,0.09)',
      chartFill: '#9D87D1',
      sun: '#E26EE5', coral: '#B98AF0', lilac: '#E6D6FA', mint: '#FBE4FB', sky: '#F1EBFC', ink: '#2A0950',
    },
    abyss: {
      light: false, style: 'lotus',
      bg: '#12061F', card: '#1C0B30', card2: '#261041', elevated: '#311654',
      text: '#F3F8FF', muted: '#C7B8E3', subtle: '#9A88BC',
      accent: '#E9A2EC', accentText: '#2A0950', accentInk: '#2A0950', titleAccent: '#E26EE5', danger: '#FF8A8A', dangerText: '#2A0950', dangerSoft: 'rgba(255,138,138,0.12)',
      border: '#2A1347', borderStrong: '#3B1D60', line3: '#6B4D93',
      lime: '#E26EE5', blue: '#C69BFF', paleBlue: '#E9C6FA', ice: '#311654', softLime: 'rgba(226,110,229,0.1)',
      navBackground: '#1C0B30', navActiveBackground: '#E26EE5', navActiveText: '#2A0950', navActiveIcon: '#2A0950', softLimeText: '#E26EE5',
      chartTrack: 'rgba(255,255,255,0.08)', surfaceWarm: 'rgba(226,110,229,0.1)',
      q1: '#E26EE5', q2: '#C69BFF', q3: '#E9C6FA', qTrack: 'rgba(255,255,255,0.08)', qCore: 'rgba(255,255,255,0.03)',
      c8: '#1C0B30', c8Line: 'rgba(243,248,255,0.06)', soft1: 'rgba(198,155,255,0.12)', soft2: 'rgba(226,110,229,0.1)', chipBg: 'rgba(226,110,229,0.14)', chipFg: '#F3B6F5',
      g1: '#E26EE5', g2: '#B04FE4', plInk: '#2A0950', plGlow: 'rgba(226,110,229,0.38)',
      hsRim: '#311654', hsTrack: '#261041', hsDot: '#6B4D93', hsIb: '#311654', hsIc: '#E26EE5',
      pattern: '#E26EE5', patternOpacity: 0.06,
      mc1: 'rgba(198,155,255,0.14)', mb1: '#C69BFF', mc2: 'rgba(226,110,229,0.12)', mb2: '#E26EE5', mc3: 'rgba(233,198,250,0.1)', mb3: '#E9C6FA', mbt: 'rgba(255,255,255,0.1)',
      lv1: 'rgba(198,155,255,0.45)', lv2: '#C69BFF', lv3: '#E26EE5', lgi: 'rgba(255,255,255,0.03)',
      pgBar: '#C69BFF', pgHl: '#E26EE5', pgSoft: 'rgba(198,155,255,0.1)', pgUp: '#E26EE5',
      heroCard: '#49108B', navShadow: '#000000',
      candy: candyDark, pill: candyDark, pillAngle: 135, candyInk: '#2A0950', candyGlow: 'rgba(226,110,229,0.36)',
      hero, heroShadow: '#E26EE5',
      chipStops: [{ offset: 0, color: '#E26EE5', opacity: 0.14 }, { offset: 1, color: '#E26EE5', opacity: 0.14 }], chipInk: '#F3B6F5',
      orbFrom: '#33175A', orbTo: '#1C0B30', orbRing: '#E26EE5', orbIcon: '#F3B6F5', orbGlow: '0px 0px 16px -4px rgba(226,110,229,0.45)', skeleton: '#291641',
      cardShadow: '#000000',
      glowA: 'rgba(226,110,229,0.20)', glowB: 'rgba(126,48,225,0.26)',
      chartFill: '#C69BFF',
      sun: '#E26EE5', coral: '#C69BFF', lilac: '#311654', mint: '#C69BFF', sky: '#261041', ink: '#F3F8FF',
    },
    // Deep is not offered in the appearance picker; it is kept so stored values stay valid.
    // Values are the Volt Deep palette passed through the prototype's Lotus colour remap.
    deep: {
      light: false, style: 'lotus',
      bg: '#130B23', card: '#211638', card2: '#2C1E49', elevated: '#3A295E',
      text: '#F1EBFC', muted: '#B8AFD1', subtle: '#988BBD',
      accent: '#B98AF0', accentText: '#2A0950', accentInk: '#2A0950', titleAccent: '#E26EE5', danger: '#FF8A8A', dangerText: '#2A0950', dangerSoft: 'rgba(255,138,138,0.12)',
      border: '#2C1E4A', borderStrong: '#412D67', line3: '#624D8D',
      lime: '#E26EE5', blue: '#B98AF0', paleBlue: '#E6D6FA', ice: '#2C1E49', softLime: 'rgba(226,110,229,0.12)',
      navBackground: '#211638', navActiveBackground: '#E26EE5', navActiveText: '#2A0950', navActiveIcon: '#2A0950', softLimeText: '#E26EE5',
      chartTrack: 'rgba(255,255,255,0.1)', surfaceWarm: 'rgba(226,110,229,0.12)',
      q1: '#E26EE5', q2: '#B98AF0', q3: '#E6D6FA', qTrack: 'rgba(255,255,255,0.08)', qCore: 'rgba(255,255,255,0.03)',
      c8: '#211638', c8Line: 'rgba(255,255,255,0.06)', soft1: 'rgba(185,138,240,0.12)', soft2: 'rgba(226,110,229,0.1)', chipBg: 'rgba(226,110,229,0.14)', chipFg: '#E26EE5',
      g1: '#E26EE5', g2: '#B98AF0', plInk: '#2A0950', plGlow: 'rgba(226,110,229,0.25)',
      hsRim: '#3A295E', hsTrack: '#2C1E49', hsDot: '#624D8D', hsIb: '#3A295E', hsIc: '#E26EE5',
      pattern: '#B98AF0', patternOpacity: 0.075,
      mc1: 'rgba(185,138,240,0.14)', mb1: '#B98AF0', mc2: 'rgba(226,110,229,0.12)', mb2: '#E26EE5', mc3: 'rgba(230,214,250,0.1)', mb3: '#E6D6FA', mbt: 'rgba(255,255,255,0.1)',
      lv1: 'rgba(185,138,240,0.45)', lv2: '#B98AF0', lv3: '#E26EE5', lgi: 'rgba(255,255,255,0.03)',
      pgBar: '#B98AF0', pgHl: '#E26EE5', pgSoft: 'rgba(185,138,240,0.1)', pgUp: '#E26EE5',
      heroCard: '#7E30E1', navShadow: '#000000',
      candy: candyDark, pill: candyDark, pillAngle: 135, candyInk: '#2A0950', candyGlow: 'rgba(226,110,229,0.36)',
      hero, heroShadow: '#E26EE5',
      chipStops: [{ offset: 0, color: '#E26EE5', opacity: 0.14 }, { offset: 1, color: '#E26EE5', opacity: 0.14 }], chipInk: '#F3B6F5',
      orbFrom: '#33175A', orbTo: '#211638', orbRing: '#E26EE5', orbIcon: '#F3B6F5', orbGlow: '0px 0px 16px -4px rgba(226,110,229,0.45)', skeleton: '#30214B',
      cardShadow: '#000000',
      glowA: 'rgba(226,110,229,0.20)', glowB: 'rgba(126,48,225,0.26)',
      chartFill: '#B98AF0',
      sun: '#E26EE5', coral: '#B98AF0', lilac: '#2C1E49', mint: '#B98AF0', sky: '#2C1E49', ink: '#F1EBFC',
    },
  },
};

let activeAppearance: Appearance = 'shore';
/**
 * A compatibility view for code that cannot use React context (for example,
 * error-boundary fallbacks). Rendered UI reads the same palette through
 * VoltThemeProvider, which is the source of truth.
 */
export let colors: Palette = palettes[activeStyle][activeAppearance];

/** Applies a style + appearance pair to the module-level views (colors and brand). */
export function setThemePalette(style: Style, appearance: Appearance) {
  activeStyle = style;
  activeAppearance = appearance;
  colors = palettes[style][appearance];
}

export function setAppearancePalette(appearance: Appearance) {
  setThemePalette(activeStyle, appearance);
}

export function getActiveAppearance(): Appearance {
  return activeAppearance;
}

export function getActiveStyle(): Style {
  return activeStyle;
}

/** Palette for an appearance in the active style (or an explicit style). */
export function getAppearancePalette(appearance: Appearance, style: Style = activeStyle): Readonly<Palette> {
  return palettes[style][appearance];
}

export function parseStyleMode(value: string | null | undefined): StyleMode {
  return value === 'volt' || value === 'lotus' ? value : 'profile';
}

/** 'profile' resolves from the profile's sex: female → Lotus, anything else → Volt. Never changes the sex. */
export function resolveStyle(mode: StyleMode, sex: 'male' | 'female' | null | undefined): Style {
  if (mode !== 'profile') return mode;
  return sex === 'female' ? 'lotus' : 'volt';
}

export function parseAppearance(value: string | undefined): Appearance {
  return value === 'abyss' || value === 'deep' ? value : 'shore';
}

export const spacing = { xs: 4, sm: 8, md: 12, base: 16, card: 16, screen: 18, section: 24, major: 32 } as const;
/** Prototype motion curves: --out and --spring. */
export const easing = { out: [0.22, 1, 0.36, 1] as const, spring: [0.34, 1.56, 0.64, 1] as const };
export const radii = { small: 14, input: 18, row: 20, tile: 20, card: 26, large: 30, pill: 999 } as const;
export const shadows = {
  // Lotus `.card8`: 0 1px 2px rgba(73,16,139,.04), 0 12px 30px -14px rgba(73,16,139,.16).
  card: { shadowColor: '#49108B', shadowOpacity: 0.12, shadowRadius: 15, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  // Lotus `.tabs`: 0 12px 32px rgba(42,9,80,.14) + lavender under-glow.
  dock: { shadowColor: '#2A0950', shadowOpacity: 0.16, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 10 },
} as const;
export const fonts = { display: 'FitDisplay', displayHeavy: 'FitDisplayHeavy', body: 'FitBody', medium: 'FitBodyMedium', semibold: 'FitBodySemiBold', bold: 'FitBodyBold', mono: 'FitBodySemiBold', arabic: 'FitArabic', arabicBold: 'FitArabicBold' } as const;
