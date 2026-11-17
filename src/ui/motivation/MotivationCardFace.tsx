import React, { memo, useId } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Pattern, Rect, Stop } from 'react-native-svg';
import { Text } from '../LocalizedText';
import { fonts } from '../theme';
import { isLight, usePalette } from '../voltKit';
import { phraseRuns, type CardLanguage, type MotivationCard } from '../../core/motivationCatalog';
import { fitPhrase } from '../../core/motivationDeck';

type Props = {
  card: MotivationCard; language: CardLanguage; width: number; height: number;
  /** "02 / 03" counter; omitted on mini thumbnails. */
  position?: { index: number; total: number };
  dateLabel?: string; mini?: boolean;
};

/** Pale-blue/white backdrop with the prototype's dotted grid and soft corner glow. */
export function CardBackdrop({ width, height }: { width: number; height: number }) {
  const p = usePalette();
  const light = isLight(p);
  const id = useId().replace(/[^A-Za-z0-9]/g, '');
  return <Svg pointerEvents="none" width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }}>
    <Defs>
      <LinearGradient id={`g${id}`} x1="1" y1="0" x2="0.15" y2="0.75">
        <Stop offset="0" stopColor={light ? '#C9E3FF' : '#9CCBFF'} stopOpacity={light ? 0.95 : 0.22}/>
        <Stop offset="0.55" stopColor={light ? '#EEF6FF' : '#9CCBFF'} stopOpacity={light ? 0.55 : 0.05}/>
        <Stop offset="1" stopColor={light ? '#FFFFFF' : '#0B0E1A'} stopOpacity={0}/>
      </LinearGradient>
      <Pattern id={`d${id}`} width={14} height={14} patternUnits="userSpaceOnUse">
        <Circle cx={3} cy={3} r={1.05} fill={light ? 'rgba(29,46,143,0.17)' : 'rgba(156,203,255,0.16)'}/>
      </Pattern>
    </Defs>
    <Rect x={0} y={0} width={width} height={height} fill={`url(#g${id})`}/>
    <Rect x={0} y={0} width={width} height={height} fill={`url(#d${id})`}/>
  </Svg>;
}

/** The poster card itself. Pure presentation: it is rendered inside the animated deck layers. */
export const MotivationCardFace = memo(function MotivationCardFace({ card, language, width, height, position, dateLabel, mini = false }: Props) {
  const p = usePalette();
  const light = isLight(p);
  const pad = Math.round(width * (mini ? 0.075 : 0.065));
  const label = { color: p.muted, fontFamily: fonts.bold, fontSize: mini ? 8 : Math.max(9.5, width * 0.03), letterSpacing: 0.9, textTransform: 'uppercase' as const };
  const arabic = language === 'ar';
  const runs = phraseRuns(card, language);
  const full = runs.map(run => run.text).join('');
  // Text box: card minus padding, the label rows and the accent rule.
  const textWidth = width - pad * 2;
  const textHeight = height * (mini ? 0.56 : 0.6);
  const fit = fitPhrase(arabic ? full : full.toUpperCase(), textWidth, textHeight, mini
    ? { max: Math.round(width * 0.096), min: 10 }
    : { max: Math.round(width * 0.13), min: Math.round(width * 0.068), lineHeight: arabic ? 1.45 : 0.98, charWidth: arabic ? 0.5 : 0.66 });
  const accentColor = light ? p.accent : p.g1;
  return <View style={{ width, height, borderRadius: mini ? 22 : 28, overflow: 'hidden', backgroundColor: light ? '#FFFFFF' : p.card, borderWidth: 1, borderColor: light ? '#DCE8F8' : p.borderStrong }}>
    <CardBackdrop width={width} height={height}/>
    <View style={{ flex: 1, padding: pad, justifyContent: 'space-between' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Text numberOfLines={1} style={[label, { flexShrink: 1 }]}>{card.category}</Text>
        {position && <Text style={label}>{String(position.index + 1).padStart(2, '0')} / {String(position.total).padStart(2, '0')}</Text>}
      </View>
      <View>
        <View style={{ width: width * (mini ? 0.2 : 0.21), height: Math.max(2, width * 0.009), borderRadius: 2, backgroundColor: accentColor, marginBottom: width * 0.045 }}/>
        <Text allowFontScaling={false} style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: fit.fontSize, lineHeight: fit.lineHeight, letterSpacing: arabic ? 0 : -fit.fontSize * 0.015, textTransform: arabic ? 'none' : 'uppercase' }}>
          {runs.map((run, i) => run.accent ? <Text key={i} allowFontScaling={false} style={{ color: accentColor, fontFamily: fonts.displayHeavy }}>{run.text}</Text> : run.text)}
        </Text>
        {!mini && <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: width * 0.05 }}>
          <Text style={label}>CUBYFIT</Text>
          {!!dateLabel && <Text style={label}>{dateLabel}</Text>}
        </View>}
      </View>
    </View>
  </View>;
});
