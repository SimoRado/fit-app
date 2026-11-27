import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { macroBarFractions } from '../core/macroBars';
import type { Nutrients } from '../core/nutrition';
import { Text } from './LocalizedText';
import { colors, fonts } from './theme';

/**
 * Add Food nutrition values — "Values Style" option 2: three stacked macro bars (Protein / Carbs /
 * Fat) on the left, the calorie total on the right, split by a thin divider.
 *
 * Values are the serving's nutrients exactly as the sheet saves them, rounded for display the same
 * way as before (`Math.round`). Bars are each macro relative to the serving's largest macro.
 * Surface and text follow the active theme; the three macro hues stay fixed (a light-mode and a
 * dark-mode shade) so Protein / Carbs / Fat read the same in Volt and Lotus.
 */
const MACRO_HUES = {
  light: { protein: '#2F6FED', carbs: '#0F9F8F', fat: '#EE8420' },
  dark: { protein: '#6EA8FF', carbs: '#2DD4BF', fat: '#FFA94D' },
} as const;

export function MacroValuesCard({ nutrients }: { nutrients: Nutrients }) {
  const { width } = useWindowDimensions();
  const narrow = width < 360;
  const hues = colors.light ? MACRO_HUES.light : MACRO_HUES.dark;
  const bars = macroBarFractions(nutrients);
  const round = (value: number) => (Number.isFinite(value) ? Math.round(value) : 0);
  const kcal = round(nutrients.kcal);
  const rows = [
    { key: 'protein', label: 'Protein', grams: round(nutrients.protein), fraction: bars.protein, color: hues.protein },
    { key: 'carbs', label: 'Carbs', grams: round(nutrients.carbs), fraction: bars.carbs, color: hues.carbs },
    { key: 'fat', label: 'Fat', grams: round(nutrients.fat), fraction: bars.fat, color: hues.fat },
  ] as const;
  return <View accessible accessibilityRole="summary"
    accessibilityLabel={`${kcal} kilocalories. Protein ${rows[0].grams} grams, carbs ${rows[1].grams} grams, fat ${rows[2].grams} grams`}
    style={{ flexDirection: 'row', alignItems: 'stretch', backgroundColor: colors.card, borderRadius: 18, paddingVertical: 12, paddingLeft: 14, paddingRight: narrow ? 10 : 12 }}>
    <View style={{ flex: 1, minWidth: 0, gap: 8, justifyContent: 'center' }}>
      {rows.map(row => <View key={row.key} style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, color: colors.muted, fontFamily: fonts.semibold, fontSize: 12 }}>{row.label}</Text>
          <Text numberOfLines={1} style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 12.5 }}>{`${row.grams}g`}</Text>
        </View>
        <View style={{ height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.chartTrack }}>
          <View style={{ width: `${row.fraction * 100}%`, height: '100%', borderRadius: 3, backgroundColor: row.color }}/>
        </View>
      </View>)}
    </View>
    <View style={{ width: 1, marginHorizontal: narrow ? 10 : 14, backgroundColor: colors.border }}/>
    <View style={{ width: narrow ? 66 : 84, alignItems: 'center', justifyContent: 'center' }}>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ color: colors.text, fontFamily: fonts.displayHeavy, fontSize: narrow ? 26 : 30, lineHeight: narrow ? 30 : 34, letterSpacing: -0.6 }}>{String(kcal)}</Text>
      <Text style={{ color: colors.muted, fontFamily: fonts.semibold, fontSize: 11 }}>kcal</Text>
    </View>
  </View>;
}
