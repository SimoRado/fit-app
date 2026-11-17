import React, { forwardRef } from 'react';
import Svg, { Circle, Defs, G, LinearGradient, Path, Pattern, Rect, Stop, Text as SvgText, TSpan } from 'react-native-svg';
import { CUBY_CAT_PATH, CUBY_EYES_PATH } from '../CubyMark';
import { fonts } from '../theme';
import { phraseRuns, type CardLanguage, type MotivationCard } from '../../core/motivationCatalog';
import { fitPhrase, wrapPhrase } from '../../core/motivationDeck';

/**
 * Exported image for sharing one Motivation card. Drawn entirely in SVG (react-native-svg
 * `toDataURL`) so it is produced on the phone; it always uses the Shore palette so the shared image
 * looks the same whatever theme the sender uses. Contains only the phrase, its category and the
 * Cubyfit mark — no account data.
 */
export const CARD_SHARE_WIDTH = 1080, CARD_SHARE_HEIGHT = 1350;
const NAVY = '#0B1446', ACCENT = '#1D2E8F', MUTED = '#4A5679';

export const MotivationShareCard = forwardRef<Svg, { card: MotivationCard; language: CardLanguage; width: number }>(function MotivationShareCard({ card, language, width }, ref) {
  const pad = 96, arabic = language === 'ar';
  const runs = phraseRuns(card, language).map(run => ({ ...run, text: arabic ? run.text : run.text.toUpperCase() }));
  const full = runs.map(run => run.text).join('');
  const box = CARD_SHARE_WIDTH - pad * 2;
  const charWidth = arabic ? 0.5 : 0.66;
  const fit = fitPhrase(full, box, 640, { max: 132, min: 64, lineHeight: arabic ? 1.4 : 1, charWidth });
  const lines = wrapPhrase(runs, Math.max(1, Math.floor(box / (fit.fontSize * charWidth))));
  const bottom = CARD_SHARE_HEIGHT - pad - 70;
  const firstBaseline = bottom - (lines.length - 1) * fit.lineHeight;
  const x = arabic ? CARD_SHARE_WIDTH - pad : pad;
  const anchor = arabic ? 'end' : 'start';
  return <Svg ref={ref} width={width} height={width * CARD_SHARE_HEIGHT / CARD_SHARE_WIDTH} viewBox={`0 0 ${CARD_SHARE_WIDTH} ${CARD_SHARE_HEIGHT}`}>
    <Defs>
      <LinearGradient id="shareGlow" x1="1" y1="0" x2="0.1" y2="0.8"><Stop offset="0" stopColor="#C9E3FF" stopOpacity={1}/><Stop offset="0.55" stopColor="#EEF6FF" stopOpacity={0.6}/><Stop offset="1" stopColor="#FFFFFF" stopOpacity={0}/></LinearGradient>
      <LinearGradient id="shareTile" x1="0" y1="1024" x2="1024" y2="0" gradientUnits="userSpaceOnUse"><Stop offset="0" stopColor="#EEF6FF"/><Stop offset="0.5" stopColor="#C9E3FF"/><Stop offset="1" stopColor="#9CCBFF"/></LinearGradient>
      <Pattern id="shareDots" width={40} height={40} patternUnits="userSpaceOnUse"><Circle cx={8} cy={8} r={3} fill="rgba(29,46,143,0.16)"/></Pattern>
    </Defs>
    <Rect width={CARD_SHARE_WIDTH} height={CARD_SHARE_HEIGHT} fill="#FFFFFF"/>
    <Rect width={CARD_SHARE_WIDTH} height={CARD_SHARE_HEIGHT} fill="url(#shareGlow)"/>
    <Rect width={CARD_SHARE_WIDTH} height={CARD_SHARE_HEIGHT} fill="url(#shareDots)"/>
    <SvgText x={x} y={pad + 30} textAnchor={anchor} fill={MUTED} fontFamily={fonts.bold} fontSize={30} letterSpacing={3}>{arabic ? card.category : card.category.toUpperCase()}</SvgText>
    <Rect x={arabic ? CARD_SHARE_WIDTH - pad - 220 : pad} y={firstBaseline - fit.fontSize - 70} width={220} height={10} rx={5} fill={ACCENT}/>
    {lines.map((line, i) => <SvgText key={i} x={x} y={firstBaseline + i * fit.lineHeight} textAnchor={anchor} fontFamily={fonts.displayHeavy} fontSize={fit.fontSize} fill={NAVY}>
      {line.map((word, k) => <TSpan key={k} fill={word.accent ? ACCENT : NAVY}>{(k ? ' ' : '') + word.text}</TSpan>)}
    </SvgText>)}
    <SvgText x={pad + 66} y={CARD_SHARE_HEIGHT - pad + 4} fill={NAVY} fontFamily={fonts.bold} fontSize={32} letterSpacing={4}>CUBYFIT</SvgText>
    <G transform={`translate(${pad} ${CARD_SHARE_HEIGHT - pad - 40}) scale(${52 / 1024})`}>
      <Rect width={1024} height={1024} rx={148.2} fill="url(#shareTile)"/>
      <G transform="scale(1.043833) translate(-18.5 -19)"><Path d={CUBY_CAT_PATH} fill="#1D2E8F"/><Path d={CUBY_EYES_PATH} fill="#DFFF1F"/></G>
    </G>
  </Svg>;
});

