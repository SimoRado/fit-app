import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './LocalizedText';
import { isLight } from './voltKit';
import type { Palette } from './theme';
import { HABIT_ICONS, isHabitIconId, type HabitGroup } from '../core/habitDesign';
import { brand } from './theme';

/** Stable icon id → Ionicons glyph; legacy emoji/text icons render as text. */
export function HabitGlyph({ icon, size, color, filled = false }: { icon: string; size: number; color: string; filled?: boolean }) {
  if (isHabitIconId(icon)) return <Ionicons name={filled ? HABIT_ICONS[icon].filled : HABIT_ICONS[icon].outline} size={size} color={color}/>;
  return <Text style={{ fontSize: size * 0.95, color }}>{icon || '•'}</Text>;
}

/**
 * Category colours. `solid`/`ink` = completed (bright); `soft`/`softInk` =
 * not yet done (muted but readable). Body = blue, Mind = lime, Routine = navy
 * (ice on the dark appearances, where navy would vanish).
 */
export function groupColors(p: Readonly<Palette>, group: HabitGroup) {
  const light = isLight(p);
  if (group === 'Body') return { solid: p.blue, ink: brand.ink, soft: light ? '#EAF3FF' : 'rgba(185,138,240,0.12)', softInk: light ? '#5E7FAE' : 'rgba(185,138,240,0.78)' };
  if (group === 'Mind') return { solid: p.lime, ink: brand.ink, soft: light ? '#F4FBD2' : 'rgba(226,110,229,0.10)', softInk: light ? '#7C8A2E' : 'rgba(226,110,229,0.72)' };
  return { solid: light ? brand.violet : brand.mist, ink: light ? '#FFFFFF' : brand.ink, soft: light ? '#E7ECF8' : 'rgba(238,246,255,0.08)', softInk: light ? '#55618A' : 'rgba(238,246,255,0.66)' };
}
