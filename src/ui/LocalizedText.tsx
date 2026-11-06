import React from 'react';
import { StyleSheet, Text as NativeText, TextProps } from 'react-native';
import { localize } from '../core/i18n';
import { useApp } from '../state/app';
import { useAppFonts } from './fonts';
import { fonts } from './theme';

export function Text({ children, style, ...props }: TextProps) {
  const { language } = useApp();
  const loaded = useAppFonts();
  const flattened = StyleSheet.flatten(style);
  const weight = flattened?.fontWeight;
  const bold = weight === 'bold' || weight === '700' || weight === '800' || weight === '900';
  const requested = flattened?.fontFamily;
  const family = language === 'ar' ? (bold || requested === fonts.display || requested === fonts.displayHeavy ? fonts.arabicBold : fonts.arabic)
    : requested === fonts.display || requested === fonts.displayHeavy ? requested
    : bold ? fonts.bold : weight === '600' ? fonts.semibold : weight === '500' ? fonts.medium : requested ?? fonts.body;
  const localized = React.Children.map(children, child => {
    if (typeof child !== 'string' && typeof child !== 'number') return child;
    const original = String(child);
    let translated = localize(original, language);
    const leading = original.match(/^\s+/)?.[0] ?? '';
    const trailing = original.match(/\s+$/)?.[0] ?? '';
    if (leading && !/^\s/.test(translated)) translated = leading + translated;
    if (trailing && !/\s$/.test(translated)) translated += trailing;
    return translated;
  });
  return <NativeText {...props} style={[{ writingDirection: language === 'ar' ? 'rtl' : 'ltr', textAlign: language === 'ar' ? 'right' : 'left' }, style, { fontFamily: loaded ? family : undefined }, loaded && { fontWeight: 'normal' }]}>{localized}</NativeText>;
}
