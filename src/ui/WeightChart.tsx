/**
 * Weight detail chart (prototype `.chartbox`): smooth area chart with pale
 * gridlines, right-aligned weight labels, date labels and a haloed selected
 * point. Geometry comes from core/weightChart (real dates, no invented values).
 */
import React, { memo, useMemo, useState } from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { chartGeometry, type WeightPoint } from '../core/weightChart';
import { fonts } from './theme';
import { usePalette } from './voltKit';

// Prototype viewBox 340×190: plot x 6…334, y 18…164, date labels at y 184.
const VB_W = 340, VB_H = 190, TOP = 18, BASE = 164;

export const WeightChart = memo(function WeightChart({ points, start, end, selectedId, onSelect, formatDate, accessibilityLabel }: { points: WeightPoint[]; start: string; end: string; selectedId: string | null; onSelect: (id: string) => void; formatDate: (day: string) => string; accessibilityLabel: string }) {
  const p = usePalette();
  const [width, setWidth] = useState(0);
  const height = width ? width * VB_H / VB_W : 0;
  const s = width / VB_W;
  const geometry = useMemo(() => width ? chartGeometry(points, start, end, { width, height: BASE * s, left: 6 * s, right: 6 * s, top: TOP * s, bottom: 0 }, 5) : null, [points, start, end, width, s]);
  if (!width || !geometry) return <View onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)} style={{ aspectRatio: VB_W / VB_H }}/>;
  const { lo, hi, yOf } = geometry;
  // Gridlines every 0.5 kg like the prototype; fall back to five even steps on wide ranges.
  const halfSteps = Math.round((hi - lo) * 2);
  const ticks = halfSteps <= 7 ? Array.from({ length: halfSteps + 1 }, (_, i) => lo + i * 0.5) : geometry.ticks;
  const placed = geometry.points;
  const selected = placed.find(point => point.id === selectedId) ?? placed.at(-1);
  const labelIdx = placed.length <= 1 ? [0] : [0, Math.floor((placed.length - 1) / 2), placed.length - 1].filter((v, i, a) => a.indexOf(v) === i);
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
      {labelIdx.map(index => placed[index] && <SvgText key={index} x={placed[index].x} y={184 * s} textAnchor={placed[index].x < 40 * s ? 'start' : placed[index].x > 300 * s ? 'end' : 'middle'} fill={p.subtle} fontSize={fontSize} fontFamily={fonts.medium}>{formatDate(placed[index].day).toUpperCase()}</SvgText>)}
    </Svg>
  </View>;
});
