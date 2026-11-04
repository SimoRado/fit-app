import React, { useEffect, useState } from 'react';
import { Animated, Pressable, useWindowDimensions, View } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../state/app';
import { Key, t } from '../../core/i18n';
import { AngularBackground } from '../../ui/components';
import { Text } from '../../ui/LocalizedText';
import { useReducedMotion } from '../../ui/motion';
import { colors, fonts } from '../../ui/theme';

const items: Record<string, { label: Key; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  index: { label: 'home', icon: 'home-outline' },
  habits: { label: 'habits', icon: 'checkbox-outline' },
  workouts: { label: 'workouts', icon: 'barbell-outline' },
  progress: { label: 'progress', icon: 'stats-chart-outline' },
  profile: { label: 'profile', icon: 'person-outline' },
};

function TabItem({ active, activeWidth, title, icon, onPress, onLongPress }: { active: boolean; activeWidth: number; title: string; icon: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void; onLongPress: () => void }) {
  const reduced = useReducedMotion();
  const [width] = useState(() => new Animated.Value(active ? activeWidth : 48));
  useEffect(() => {
    if (reduced) { width.setValue(active ? activeWidth : 48); return; }
    Animated.timing(width, { toValue: active ? activeWidth : 48, duration: 380, useNativeDriver: false }).start();
  }, [active, activeWidth, reduced, width]);
  return <Animated.View style={{ width, height: 52 }}>
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={title} onPress={onPress} onLongPress={onLongPress} style={{ flex: 1, minWidth: 44, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: active ? colors.accent : 'transparent', paddingHorizontal: 6 }}>
      <Ionicons name={icon} size={active ? 21 : 19} color={active ? colors.accentText : colors.muted}/>
      {active && <Text numberOfLines={1} style={{ color: colors.accentText, fontFamily: fonts.mono, fontSize: 10, letterSpacing: .7, textTransform: 'uppercase', flexShrink: 1 }}>{title}</Text>}
    </Pressable>
  </Animated.View>;
}

function FloatingTabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const { language } = useApp();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const activeWidth = Math.max(102, Math.min(160, width - 42 - 4 * 48));
  return <View style={{ position: 'absolute', bottom: Math.max(10, insets.bottom), left: 14, right: 14, maxWidth: 600, alignSelf: 'center', height: 66, padding: 7 }}>
    <AngularBackground color="rgba(19,22,27,0.84)" cut={20} border={colors.border}/>
    <View style={{ flex: 1, flexDirection: language === 'ar' ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-around' }}>
      {state.routes.map((route, index) => {
        const item = items[route.name];
        if (!item) return null;
        const active = state.index === index;
        return <TabItem key={route.key} active={active} activeWidth={activeWidth} title={t(language, item.label)} icon={item.icon}
          onPress={() => { const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true }); if (!active && !event.defaultPrevented) navigateToTab(route.key); }}
          onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}/>;
      })}
    </View>
  </View>;
}

export default function Layout() {
  return <Tabs tabBar={props => <FloatingTabBar {...props}/>} screenOptions={{ headerShown: false }}>
    {Object.keys(items).map(name => <Tabs.Screen key={name} name={name}/>)}
  </Tabs>;
}
