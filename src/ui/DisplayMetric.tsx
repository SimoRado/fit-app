import React from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import { useApp } from '../state/app';
import { useAppFonts } from './fonts';
import { colors, fonts } from './theme';
import { Text } from './LocalizedText';

let nextId = 0;

/** Poster numerals in the reference fade from bone white into the background. */
export function DisplayMetric({ value, size = 104, label, accent }: { value: string | number; size?: number; label?: string; accent?: string }) {
  const { language } = useApp();
  const loaded = useAppFonts();
  const [id] = React.useState(() => `metric-${++nextId}`);
  const valueText = String(value);
  const arabic = language === 'ar';
  const height = Math.round(size * (arabic ? 1.18 : 1.02));
  const estimatedWidth = Math.max(65, Math.ceil(size * (arabic ? .58 : .55) * valueText.length + 10));
  return <View style={{ flexDirection: 'row', alignItems: 'flex-end', maxWidth: '100%', minWidth: 0 }} accessibilityLabel={valueText + (label ? ' ' + label : '')}>
    {loaded ? <Svg width={estimatedWidth} height={height} style={{ maxWidth: '100%' }} viewBox={`0 0 ${estimatedWidth} ${height}`}>
      <Defs><LinearGradient id={id} x1="0" y1="0" x2="0" y2="1"><Stop offset="32%" stopColor={colors.text}/><Stop offset="100%" stopColor="#505257"/></LinearGradient></Defs>
      <SvgText x={estimatedWidth / 2} y={arabic ? size : size * .86} textAnchor="middle" fill={`url(#${id})`} fontFamily={arabic ? fonts.arabicBold : fonts.displayHeavy} fontSize={size} fontWeight={arabic ? '700' : '900'}>{valueText}</SvgText>
    </Svg> : <Text style={{ color: colors.text, fontFamily: arabic ? fonts.arabicBold : fonts.displayHeavy, fontSize: size, lineHeight: height }}>{valueText}</Text>}
    {!!label && <Text style={{ color: accent ?? colors.accent, fontFamily: fonts.mono, fontSize: Math.min(20, size * .2), marginBottom: 9, marginLeft: 3 }}>{label}</Text>}
  </View>;
}
