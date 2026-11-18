/**
 * Personalization (reference screenshots 2 and 3): Sex, Style (Match my
 * profile / Volt / Lotus) and Appearance (Light / Dark).
 *
 * - Sex is the existing `body.sex` preference (also used for calorie
 *   estimates); nothing else about the profile changes here.
 * - Style and appearance are independent: Volt Light, Volt Dark, Lotus Light,
 *   Lotus Dark. "Match my profile" is only a visual default (female → Lotus,
 *   otherwise Volt); either style can always be chosen manually, and choosing
 *   one never changes the sex.
 * - Changing style or appearance only changes colours; no fitness data is touched.
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './LocalizedText';
import { message } from './components';
import { fonts, getAppearancePalette, resolveStyle, type Appearance, type Palette, type Style, type StyleMode } from './theme';
import { usePalette } from './voltKit';
import { useApp } from '../state/app';
import type { Sex } from '../core/nutritionTargets';

const styleSwatches: Record<Style, [string, string, string]> = {
  volt: ['#1D2E8F', '#9CCBFF', '#DFFF1F'],
  lotus: ['#7E30E1', '#E26EE5', '#B04FE4'],
};

export function PersonalizationSheet() {
  const p = usePalette();
  const { sex, setSex, styleMode, setStyleMode, style, appearance, setAppearance } = useApp();
  const run = (task: Promise<void>) => { task.catch(message); };
  const profileStyle = resolveStyle('profile', sex);
  const options: { mode: StyleMode; title: string; subtitle: string; swatch: [string, string, string] }[] = [
    { mode: 'profile', title: 'Match my profile', subtitle: `Currently ${profileStyle === 'lotus' ? 'Lotus' : 'Volt'}`, swatch: ['#1D2E8F', '#7E30E1', '#E26EE5'] },
    { mode: 'volt', title: 'Volt', subtitle: 'Navy, sky and volt', swatch: styleSwatches.volt },
    { mode: 'lotus', title: 'Lotus', subtitle: 'Indigo, violet and orchid', swatch: styleSwatches.lotus },
  ];
  const visibleAppearance: Appearance = appearance === 'shore' ? 'shore' : 'abyss';
  return <View style={{ gap: 10 }}>
    <Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 13.5, lineHeight: 20 }}>Cubyfit adapts its colours to your preferences. Choose a style and appearance that feel right for you. Your data and tracking stay exactly the same.</Text>

    <SectionHead title="Sex" hint="Also used for calorie estimates"/>
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', padding: 4, borderRadius: 999, backgroundColor: p.light ? p.soft1 : p.card2 }}>
      {(['male', 'female'] as Sex[]).map(value => {
        const on = sex === value;
        return <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => { if (!on) run(setSex(value)); }}
          style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: on ? (p.light ? p.c8 : p.elevated) : 'transparent', ...(on && p.light ? { boxShadow: '0px 2px 8px rgba(11,20,70,0.12)' } : {}) }}>
          <Text style={{ color: on ? p.text : p.muted, fontFamily: fonts.bold, fontSize: 14 }}>{value === 'male' ? 'Male' : 'Female'}</Text>
        </Pressable>;
      })}
    </View>
    {!sex && <Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 12 }}>Not set yet. Automatic calorie estimates are less precise without it.</Text>}
    {!!sex && <Text style={{ color: p.subtle, fontFamily: fonts.medium, fontSize: 12, lineHeight: 17 }}>Changing this updates automatic calorie estimates. Targets you set yourself stay the same.</Text>}

    <SectionHead title="Style" hint="Colours across the app"/>
    <View accessibilityRole="radiogroup" style={{ gap: 10 }}>
      {options.map(option => <StyleCard key={option.mode} {...option} selected={styleMode === option.mode} onPress={() => { if (styleMode !== option.mode) run(setStyleMode(option.mode)); }}/>)}
    </View>

    <SectionHead title="Appearance" hint="Light or dark"/>
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 10 }}>
      {(['shore', 'abyss'] as const).map(value => <AppearanceCard key={value} appearance={value} style={style} selected={visibleAppearance === value} onPress={() => { if (appearance !== value) run(setAppearance(value)); }}/>)}
    </View>
    <Text style={{ color: p.subtle, fontFamily: fonts.medium, fontSize: 12, lineHeight: 17 }}>Style and appearance only change colours. Your profile, habits, workouts, nutrition and weight are not affected.</Text>
  </View>;
}

function SectionHead({ title, hint }: { title: string; hint: string }) {
  const p = usePalette();
  return <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 10, gap: 10 }}>
    <Text accessibilityRole="header" style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 17, letterSpacing: -0.3 }}>{title}</Text>
    <Text numberOfLines={1} style={{ flexShrink: 1, color: p.muted, fontFamily: fonts.medium, fontSize: 12 }}>{hint}</Text>
  </View>;
}

function Radio({ on }: { on: boolean }) {
  const p = usePalette();
  return <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: on ? 0 : 1.5, borderColor: p.borderStrong, backgroundColor: on ? p.text : 'transparent' }}>
    {on && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.light ? '#FFFFFF' : p.bg }}/>}
  </View>;
}

function StyleCard({ title, subtitle, swatch, selected, onPress }: { mode: StyleMode; title: string; subtitle: string; swatch: [string, string, string]; selected: boolean; onPress: () => void }) {
  const p = usePalette();
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={`${title}, ${subtitle}`} onPress={onPress}
    style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 22, backgroundColor: p.c8, borderWidth: selected ? 2 : 1, borderColor: selected ? p.text : p.c8Line, ...(p.light && !selected ? { boxShadow: '0px 2px 8px rgba(11,20,70,0.04)' } : {}) }}>
    <View style={{ width: 54, height: 54, borderRadius: 14, justifyContent: 'center', gap: 4, paddingHorizontal: 9, backgroundColor: p.light ? p.soft1 : p.card2, borderWidth: 1, borderColor: p.c8Line }}>
      <View style={{ width: 34, height: 5, borderRadius: 3, backgroundColor: swatch[0] }}/>
      <View style={{ width: 26, height: 5, borderRadius: 3, backgroundColor: swatch[1] }}/>
      <View style={{ width: 18, height: 5, borderRadius: 3, backgroundColor: swatch[2] }}/>
    </View>
    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
      <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 16 }}>{title}</Text>
      <Text numberOfLines={1} style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 12.5 }}>{subtitle}</Text>
    </View>
    <Radio on={selected}/>
  </Pressable>;
}

/** Mini mock of the app in the given style + appearance (reference screenshot 3). */
function AppearanceCard({ appearance, style, selected, onPress }: { appearance: 'shore' | 'abyss'; style: Style; selected: boolean; onPress: () => void }) {
  const p = usePalette();
  const m: Readonly<Palette> = getAppearancePalette(appearance, style);
  const label = appearance === 'shore' ? 'Light' : 'Dark';
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={`${label} appearance`} onPress={onPress}
    style={{ flex: 1, minWidth: 0, gap: 10, padding: 8, paddingBottom: 12, borderRadius: 22, backgroundColor: p.c8, borderWidth: selected ? 2 : 1, borderColor: selected ? p.accent : p.c8Line }}>
    <View style={{ borderRadius: 16, overflow: 'hidden', padding: 10, gap: 8, backgroundColor: m.bg, ...(appearance === 'shore' ? { backgroundImage: `radial-gradient(120% 80% at 100% 0%, ${m.style === 'lotus' ? 'rgba(226,110,229,0.18)' : 'rgba(156,203,255,0.35)'}, transparent 70%)` } : {}) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: m.accent }}/>
        <View style={{ width: 48, height: 5, borderRadius: 3, backgroundColor: m.text }}/>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 10, backgroundColor: m.c8 }}>
        <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 4, borderColor: m.q1, borderRightColor: m.q3, borderBottomColor: m.q3 }}/>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ width: '90%', height: 4, borderRadius: 2, backgroundColor: m.text }}/>
          <View style={{ width: '60%', height: 4, borderRadius: 2, backgroundColor: m.muted }}/>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <View style={{ flex: 1, height: 20, borderRadius: 7, backgroundColor: m.soft1 }}/>
        <View style={{ flex: 1, height: 20, borderRadius: 7, backgroundColor: m.soft2 }}/>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, padding: 3, borderRadius: 999, backgroundColor: m.c8 }}>
        <View style={{ width: 26, height: 9, borderRadius: 5, backgroundColor: m.g1 }}/>
        {[0, 1, 2].map(i => <View key={i} style={{ flex: 1, alignItems: 'center' }}><View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: m.line3 }}/></View>)}
      </View>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 }}>
      <Text style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 15 }}>{label}</Text>
      <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? p.accent : 'transparent', borderWidth: selected ? 0 : 1.5, borderColor: p.borderStrong }}>
        {selected && <Ionicons name="checkmark" size={14} color={p.accentText}/>}
      </View>
    </View>
  </Pressable>;
}
