/**
 * Weight detail chart (prototype `.chartbox`): smooth area chart with pale
 * gridlines, right-aligned weight labels, date labels and a haloed selected
 * point. Geometry comes from core/weightChart (real dates, no invented values):
 * the X domain is always the whole selected 7/30/90-day window, so points sit
 * at their real dates and a short history keeps its real time span. X labels
 * are timeline ticks for that window (`axisTicks`), not data-point labels.
 */
import React, { memo, useMemo, useState } from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { axisTicks, chartGeometry, type AxisRange, type AxisTick, type WeightPoint } from '../core/weightChart';
import { fonts } from './theme';
import { usePalette } from './voltKit';

// Prototype viewBox 340×190: plot x 14…326 (inset so the first/last point halos are never clipped),
// y 18…164, date labels at y 184.
const VB_W = 340, VB_H = 190, TOP = 18, BASE = 164, INSET = 14;

export const WeightChart = memo(function WeightChart({ points, range, start, end, selectedId, onSelect, formatTick, accessibilityLabel }: { points: WeightPoint[]; range: AxisRange; start: string; end: string; selectedId: string | null; onSelect: (id: string) => void; formatTick: (tick: AxisTick) => string; accessibilityLabel: string }) {
  const p = usePalette();
  const [width, setWidth] = useState(0);
  const height = width ? width * VB_H / VB_W : 0;
  const s = width / VB_W;
  const geometry = useMemo(() => width ? chartGeometry(points, start, end, { width, height: BASE * s, left: INSET * s, right: INSET * s, top: TOP * s, bottom: 0 }, 5) : null, [points, start, end, width, s]);
  if (!width || !geometry) return <View onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)} style={{ aspectRatio: VB_W / VB_H }}/>;
  const { lo, hi, yOf } = geometry;
  // Gridlines every 0.5 kg like the prototype; fall back to five even steps on wide ranges.
  const halfSteps = Math.round((hi - lo) * 2);
  const ticks = halfSteps <= 7 ? Array.from({ length: halfSteps + 1 }, (_, i) => lo + i * 0.5) : geometry.ticks;
  const placed = geometry.points;
  const selected = placed.find(point => point.id === selectedId) ?? placed.at(-1);
  const ticksX = axisTicks(range, start, end).map(tick => ({ tick, x: geometry.xOf(tick.day) }));
  const fontSize = 9 * Math.max(1, s * 0.92);
  return <View onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="wfill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={p.chartFill} stopOpacity={0.32}/>
          <Stop offset="1" stopColor={p.chartFill} stopOpacity={0}/>
        </LinearGradient>
      </Defs>
      {ticks.map(tick => { const y = yOf(tick); return <React.Fragment key={tick}>
        <Line x1={6 * s} x2={334 * s} y1={y} y2={y} stroke={p.border} strokeWidth={1}/>
        <SvgText x={334 * s} y={y - 5} textAnchor="end" fill={p.subtle} fontSize={fontSize} fontFamily={fonts.medium}>{tick.toFixed(1)}</SvgText>
      </React.Fragment>; })}
      {!!geometry.area && <Path d={geometry.area} fill="url(#wfill)"/>}
      {placed.length > 1 && <Path d={geometry.line} fill="none" stroke={p.accent} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round"/>}
      {selected && <>
        <Line x1={selected.x} x2={selected.x} y1={12 * s} y2={BASE * s} stroke={p.line3} strokeWidth={1} strokeDasharray="3 4"/>
        <Circle cx={selected.x} cy={selected.y} r={9} fill={p.accent} opacity={0.2}/>
        <Circle cx={selected.x} cy={selected.y} r={4.5} fill={p.accent} stroke={p.bg} strokeWidth={2}/>
      </>}
      {/* Generous invisible touch targets for every recorded day. */}
      {placed.map(point => <Circle key={point.id} cx={point.x} cy={point.y} r={16} fill="transparent" onPress={() => onSelect(point.id)}/>)}
      {ticksX.map(({ tick, x }) => <SvgText key={tick.day} x={x} y={184 * s} textAnchor={x < (INSET + 16) * s ? 'start' : x > (VB_W - INSET - 16) * s ? 'end' : 'middle'} fill={p.subtle} fontSize={fontSize} fontFamily={fonts.medium}>{formatTick(tick)}</SvgText>)}
    </Svg>
  </View>;
});
