import React, { forwardRef } from 'react';
import Svg, { Defs, G, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { cellState, monthWeeks, yearMonths, type HistoryDay } from '../core/habitHistory';
import { fromDay } from '../core/date';
import { CUBY_CAT_PATH, CUBY_EYES_PATH } from './CubyMark';
import { LEGEND } from './HistoryCalendar';
import { fonts, brand } from './theme';

/**
 * "Share my year" image: drawn entirely in SVG so it renders to a PNG on the device
 * (react-native-svg `toDataURL`). Always uses the Shore palette so a shared image looks the same
 * whatever theme the sender uses. Contains only the year, the day shades and a heading — no habit
 * names, measurements or account details.
 */
export const SHARE_WIDTH = 1080, SHARE_HEIGHT = 1350;
const SHADES = ['#E3ECFA', brand.lilac, brand.lavender, brand.violet];
const NAVY = brand.ink, MUTED = '#4A5679', OUTLINE = '#CCDAEE';

export function shareHeadline(rows: HistoryDay[]) {
  const tracked = rows.filter(row => row.eligible);
  if (!tracked.length) return 'Every day is a fresh start.';
  const average = tracked.reduce((sum, row) => sum + row.percent, 0) / tracked.length;
  return average >= 68 ? 'A year of showing up.' : average >= 34 ? 'Built one day at a time.' : 'Every day counts.';
}

export const YearShareCard = forwardRef<Svg, { year: number; rows: ReadonlyMap<string, HistoryDay>; today: string; locale: string; width: number }>(function YearShareCard({ year, rows, today, locale, width }, ref) {
  const list = [...rows.values()];
  const headline = shareHeadline(list);
  const strong = list.filter(row => row.eligible && row.percent >= 68).length;
  const pad = 72, colGap = 36, rowGap = 40, cols = 4, gap = 5;
  const monthWidth = (SHARE_WIDTH - pad * 2 - colGap * (cols - 1)) / cols;
  const cell = (monthWidth - gap * 6) / 7;
  const gridTop = 450, monthHeight = 34 + 6 * (cell + gap);
  return <Svg ref={ref} width={width} height={width * SHARE_HEIGHT / SHARE_WIDTH} viewBox={`0 0 ${SHARE_WIDTH} ${SHARE_HEIGHT}`}>
    <Defs>
      <LinearGradient id="shareTile" x1="0" y1="1024" x2="1024" y2="0" gradientUnits="userSpaceOnUse"><Stop offset="0" stopColor={brand.mist}/><Stop offset="0.5" stopColor={brand.lilac}/><Stop offset="1" stopColor={brand.lavender}/></LinearGradient>
    </Defs>
    <Rect width={SHARE_WIDTH} height={SHARE_HEIGHT} fill={brand.snow}/>
    <Rect x={SHARE_WIDTH - 300} y={-140} width={440} height={440} rx={200} fill={brand.mist}/>
    <Rect x={-160} y={SHARE_HEIGHT - 260} width={380} height={380} rx={170} fill={brand.blush}/>
    <G transform={`translate(${pad} ${pad}) scale(${96 / 1024})`}>
      <Rect width={1024} height={1024} rx={148.2} fill="url(#shareTile)"/>
      <G transform="scale(1.043833) translate(-18.5 -19)"><Path d={CUBY_CAT_PATH} fill={brand.violet}/><Path d={CUBY_EYES_PATH} fill={brand.orchid}/></G>
    </G>
    <SvgText x={pad + 120} y={pad + 62} fill={NAVY} fontSize={44} fontFamily={fonts.displayHeavy} fontWeight="800">Cubyfit</SvgText>
    <SvgText x={pad} y={pad + 210} fill={brand.violet} fontSize={128} fontFamily={fonts.displayHeavy} fontWeight="800" letterSpacing={-4}>{String(year)}</SvgText>
    <SvgText x={pad} y={pad + 280} fill={NAVY} fontSize={46} fontFamily={fonts.displayHeavy} fontWeight="800">{headline}</SvgText>
    <SvgText x={pad} y={pad + 326} fill={MUTED} fontSize={28} fontFamily={fonts.semibold}>{strong === 1 ? '1 day at 68% or more' : `${strong} days at 68% or more`}</SvgText>
    {yearMonths(year).map((month, index) => {
      const x = pad + (index % cols) * (monthWidth + colGap);
      const y = gridTop + Math.floor(index / cols) * (monthHeight + rowGap);
      const name = new Intl.DateTimeFormat(locale, { month: 'short' }).format(fromDay(`${month}-15`));
      return <G key={month}>
        <SvgText x={x} y={y + 22} fill={NAVY} fontSize={24} fontFamily={fonts.bold} fontWeight="700">{name}</SvgText>
        {monthWeeks(month).flatMap((week, row) => week.map((day, column) => {
          if (!day) return null;
          const state = cellState(day, today, rows.get(day));
          const shaded = typeof state === 'number';
          return <Rect key={day} x={x + column * (cell + gap)} y={y + 34 + row * (cell + gap)} width={cell} height={cell} rx={cell * 0.28}
            fill={shaded ? SHADES[state] : state === 'future' ? '#EEF3FA' : 'none'} stroke={shaded || state === 'future' ? 'none' : OUTLINE} strokeWidth={2}/>;
        }))}
      </G>;
    })}
    {LEGEND.map((item, index) => {
      const x = pad + index * 236;
      return <G key={item.level}>
        <Rect x={x} y={SHARE_HEIGHT - 112} width={30} height={30} rx={9} fill={SHADES[item.level]}/>
        <SvgText x={x + 42} y={SHARE_HEIGHT - 88} fill={MUTED} fontSize={26} fontFamily={fonts.semibold}>{item.label}</SvgText>
      </G>;
    })}
    <SvgText x={SHARE_WIDTH - pad} y={SHARE_HEIGHT - 40} fill={MUTED} fontSize={22} fontFamily={fonts.medium} textAnchor="end">Habits tracked with Cubyfit</SvgText>
  </Svg>;
});
