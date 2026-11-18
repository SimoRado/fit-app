/**
 * Cubyfit Lotus decorative art, ported 1:1 from the designer's final prototype
 * (`Cubyfit-VoltVFinal.html`, the `html.x-f` rules):
 *
 * - `LotusBackground`: `.viewport` radial glows + `.viewport::before` line art
 *   (seven thin curves and rings, faded out over the bottom 30%).
 * - `LotusFlower`: the seven-petal line flower used on the weight card
 *   (`.wc`), Pro row and meal card (`.ml8`).
 * - `HeroWaves`: the two soft waves at the bottom of the weight card.
 *
 * Everything is static vector art (react-native-svg) or native CSS gradients
 * (`backgroundImage`, React Native New Architecture). No bitmaps, no animation,
 * never focusable or touchable.
 */
import React, { memo } from 'react';
import { View, useWindowDimensions, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';
import { useVoltTheme } from './VoltThemeProvider';
import type { GradientStops } from './theme';

/** CSS `linear-gradient(<angle>deg, ...)` string for React Native `backgroundImage`. */
export function linearGradient(angle: number, stops: GradientStops) {
  return `linear-gradient(${angle}deg, ${stops.map(stop => `${stop.opacity === undefined ? stop.color : rgbaOf(stop.color, stop.opacity)} ${Math.round(stop.offset * 1000) / 10}%`).join(', ')})`;
}

function rgbaOf(hex: string, opacity: number) {
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${opacity})`;
}

/** Background style for a candy (`--lt-candy`) surface, including its glow. */
export function candyStyle(palette: { candy: GradientStops; candyGlow: string }, glow: 'button' | 'pill' | 'none' = 'button'): ViewStyle {
  return {
    backgroundImage: linearGradient(135, palette.candy),
    ...(glow === 'none' ? {} : { boxShadow: glow === 'pill' ? `0px 8px 20px -6px ${palette.candyGlow}` : `0px 10px 22px -8px ${palette.candyGlow}` }),
  };
}

// `.viewport::before` mask artwork, viewBox 0 0 400 860, `preserveAspectRatio="xMidYMin slice"`, `mask-size: 100% auto`.
const LINE_ART = [
  'M250 70c40-48 118-30 122 30 4 52-56 74-88 44-26-24-6-62 22-56',
  'M226 64c52-80 196-50 196 50 0 92-112 122-160 64',
  'M-20 196C60 150 140 170 210 196S330 238 420 190',
  'M-20 226C60 182 150 202 220 226S340 262 420 222',
  'M-20 520C70 480 150 500 230 526S350 560 420 516',
  'M40 640c-30 34-4 84 40 76 36-6 40-54 10-60-22-4-30 22-14 30',
  'M-20 780C60 744 150 760 220 784S340 812 420 776',
];

/**
 * Fixed page background: pale snow base, two header glows and thin line art.
 * Anchored to the window (not the scroll content) like the prototype viewport,
 * so it does not move or stretch when the keyboard resizes a page.
 */
export const LotusBackground = memo(function LotusBackground({ fade = true }: { fade?: boolean }) {
  const { palette, appearance } = useVoltTheme();
  const { width, height } = useWindowDimensions();
  const artHeight = width * 860 / 400;
  const id = `lb${appearance}`;
  return <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden
    style={{
      position: 'absolute', top: 0, left: 0, width, height, overflow: 'hidden', backgroundColor: palette.bg,
      // `.viewport` glows: radial-gradient(90% 38% at 100% 0%, …), radial-gradient(70% 30% at 0% 2%, …)
      backgroundImage: `radial-gradient(${Math.round(width * 0.9)}px ${Math.round(height * 0.38)}px at 100% 0%, ${palette.glowA}, transparent 70%), radial-gradient(${Math.round(width * 0.7)}px ${Math.round(height * 0.3)}px at 0% 2%, ${palette.glowB}, transparent 70%)`,
    }}>
    <Svg width={width} height={Math.min(artHeight, height)} viewBox={`0 0 400 ${Math.min(860, 400 * height / width)}`} preserveAspectRatio="xMidYMin slice" style={{ position: 'absolute', top: 0, left: 0 }}>
      <Defs>
        {/* mask linear-gradient(180deg, #000 0, #000 70%, transparent) over the viewport height */}
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2={400 * height / width} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={palette.pattern} stopOpacity={palette.patternOpacity}/>
          <Stop offset={fade ? 0.7 : 1} stopColor={palette.pattern} stopOpacity={palette.patternOpacity}/>
          <Stop offset="1" stopColor={palette.pattern} stopOpacity={fade ? 0 : palette.patternOpacity}/>
        </LinearGradient>
      </Defs>
      <G fill="none" stroke={`url(#${id})`} strokeWidth={1.6} strokeLinecap="round">
        {LINE_ART.map(d => <Path key={d} d={d}/>)}
      </G>
    </Svg>
  </View>;
});

const PETAL = 'M0 0C22-34 22-82 0-118C-22-82-22-34 0 0Z';
const PETAL_ANGLES = [-78, -52, -26, 0, 26, 52, 78];

/**
 * The prototype's seven-petal lotus (viewBox -130 -130 260 160). `size` is the
 * rendered width; height follows the 260:160 ratio.
 */
export const LotusFlower = memo(function LotusFlower({ size, color = '#FFFFFF', fillOpacity = 0.1, strokeOpacity = 0.3, style }: { size: number; color?: string; fillOpacity?: number; strokeOpacity?: number; style?: ViewStyle }) {
  return <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[{ position: 'absolute', width: size, height: size * 160 / 260 }, style]}>
    <Svg width="100%" height="100%" viewBox="-130 -130 260 160">
      {PETAL_ANGLES.map(angle => <Path key={angle} d={PETAL} transform={`rotate(${angle})`} fill={color} fillOpacity={fillOpacity} stroke={color} strokeOpacity={strokeOpacity} strokeWidth={2}/>)}
      <Path d="M-92 4C-60 22 60 22 92 4" fill="none" stroke={color} strokeOpacity={strokeOpacity} strokeWidth={2}/>
      <Circle cx={0} cy={-6} r={7} fill={color} fillOpacity={strokeOpacity}/>
    </Svg>
  </View>;
});

/** `.wc` bottom waves: `left bottom / 100% 46%`, viewBox 0 0 400 120, stretched. */
export const HeroWaves = memo(function HeroWaves() {
  return <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '46%' }}>
    <Svg width="100%" height="100%" viewBox="0 0 400 120" preserveAspectRatio="none">
      <Path d="M0 70C70 30 130 30 200 62S330 104 400 58V120H0Z" fill="#FFFFFF" fillOpacity={0.1}/>
      <Path d="M0 92C80 62 140 66 210 88S340 112 400 86V120H0Z" fill="#FFFFFF" fillOpacity={0.08}/>
    </Svg>
  </View>;
});
