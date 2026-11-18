import React, { memo } from 'react';
import { Image, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useVoltTheme } from './VoltThemeProvider';

/**
 * Volt graffiti page background, ported from the prototype's
 * `<style id="bg-pattern">`:
 *
 *   .viewport::before { background: var(--pat-c); opacity: var(--pat-o);
 *     mask-image: url(<graffiti.webp>), linear-gradient(transparent 0, #000 90px, #000 calc(100% - 110px), transparent 100%);
 *     mask-size: cover; mask-position: center }
 *
 * - The artwork is the original embedded WebP (540×960, black strokes whose
 *   alpha is the mask), unchanged. `tintColor` recolours exactly those pixels,
 *   which is what `background-color + mask-image` does in CSS.
 * - Sized like `cover` against the window (not the container) so it stays put
 *   when the keyboard resizes a page, and never stretches.
 * - The 90 px top / 110 px bottom mask fade is reproduced by laying a
 *   background-coloured gradient over the pattern; over a solid page colour
 *   that is mathematically the same as masking the pattern.
 * - Static: no animation, pointer-events none, memoised; it only re-renders on
 *   an appearance or window-size change.
 */
const ART = require('../../assets/graffiti.webp');
const ART_WIDTH = 540, ART_HEIGHT = 960;
const FADE_TOP = 90, FADE_BOTTOM = 110;

export const GraffitiBackground = memo(function GraffitiBackground({ fade = true }: { fade?: boolean }) {
  const { palette, appearance } = useVoltTheme();
  const { width, height } = useWindowDimensions();
  const scale = Math.max(width / ART_WIDTH, height / ART_HEIGHT);
  const artWidth = Math.ceil(ART_WIDTH * scale), artHeight = Math.ceil(ART_HEIGHT * scale);
  const id = `gf${appearance}`;
  return <View pointerEvents="none" importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', top: 0, left: 0, width, height, overflow: 'hidden' }}>
    <Image source={ART} fadeDuration={0} resizeMode="stretch" accessibilityIgnoresInvertColors
      style={{ position: 'absolute', left: (width - artWidth) / 2, top: (height - artHeight) / 2, width: artWidth, height: artHeight, tintColor: palette.pattern, opacity: palette.patternOpacity }}/>
    {fade && <Svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }}>
      <Defs>
        <LinearGradient id={`${id}t`} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={palette.bg} stopOpacity={1}/><Stop offset="1" stopColor={palette.bg} stopOpacity={0}/></LinearGradient>
        <LinearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={palette.bg} stopOpacity={0}/><Stop offset="1" stopColor={palette.bg} stopOpacity={1}/></LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={FADE_TOP} fill={`url(#${id}t)`}/>
      <Rect x={0} y={height - FADE_BOTTOM} width={width} height={FADE_BOTTOM} fill={`url(#${id}b)`}/>
    </Svg>}
  </View>;
});
