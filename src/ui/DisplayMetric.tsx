import React from 'react';
import { View } from 'react-native';
import Svg, { Text as SvgText } from 'react-native-svg';
import { useApp } from '../state/app';
import { useAppFonts } from './fonts';
import { colors, fonts } from './theme';
import { Text } from './LocalizedText';

/** V4 Bloom uses heavy Bricolage numerals at poster scale. */
export function DisplayMetric({ value, size = 104, label, accent }: { value: string | number; size?: number; label?: string; accent?: string }) {
  const { language } = useApp();
  const loaded = useAppFonts();
  const valueText = String(value);
  const arabic = language === 'ar';
  const height = Math.round(size * (arabic ? 1.18 : 1.02));
  const estimatedWidth = Math.max(65, Math.ceil(size * (arabic ? .65 : .69) * valueText.length + 10));
  return <View style={{ flexDirection: 'row', alignItems: 'flex-end', maxWidth: '100%', minWidth: 0 }} accessibilityLabel={valueText + (label ? ' ' + label : '')}>
    {loaded ? <Svg width={estimatedWidth} height={height} style={{ maxWidth: '100%' }} viewBox={`0 0 ${estimatedWidth} ${height}`}>
      <SvgText x={estimatedWidth / 2} y={arabic ? size : size * .86} textAnchor="middle" fill={colors.ink} fontFamily={arabic ? fonts.arabicBold : fonts.displayHeavy} fontSize={size} fontWeight={arabic ? '700' : '800'}>{valueText}</SvgText>
    </Svg> : <Text style={{ color: colors.text, fontFamily: arabic ? fonts.arabicBold : fonts.displayHeavy, fontSize: size, lineHeight: height }}>{valueText}</Text>}
    {!!label && <Text style={{ color: accent ?? colors.muted, fontFamily: fonts.bold, fontSize: Math.min(20, size * .2), marginBottom: 9, marginLeft: 3 }}>{label}</Text>}
  </View>;
}
