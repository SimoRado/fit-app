import React from 'react';
import { Text as NativeText, TextProps } from 'react-native';
import { localize } from '../core/i18n';
import { useApp } from '../state/app';

export function Text({ children, style, ...props }: TextProps) {
  const { language } = useApp();
  const localized = React.Children.map(children, child => typeof child === 'string' || typeof child === 'number' ? localize(String(child), language) : child);
  return <NativeText {...props} style={[{ writingDirection: language === 'ar' ? 'rtl' : 'ltr', textAlign: language === 'ar' ? 'right' : 'left' }, style]}>{localized}</NativeText>;
}
