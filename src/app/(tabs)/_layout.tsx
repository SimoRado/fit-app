import React, { useEffect } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { PRESS_IN_DURATION_MS, PRESS_OUT_DURATION_MS, TAB_SELECTION_DURATION_MS } from '../../core/pressMotion';
import { useApp } from '../../state/app';
import { Key, t } from '../../core/i18n';
import { fonts, radii } from '../../ui/theme';
import { useVoltTheme } from '../../ui/VoltThemeProvider';
import { primaryTabRoutes, secondaryTabRoutes } from '../../core/voltNavigation';
import { TabMotionProvider, useReducedMotion, useTabMotion } from '../../ui/motion';
import { candyStyle } from '../../ui/LotusArt';
import type { Palette } from '../../ui/theme';

const items: Record<string, { label: Key; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  index: { label: 'home', icon: 'home-outline' },
  workouts: { label: 'workouts', icon: 'barbell-outline' },
  nutrition: { label: 'nutrition', icon: 'restaurant-outline' },
  habits: { label: 'habits', icon: 'checkmark-circle-outline' },
  progress: { label: 'progress', icon: 'bar-chart-outline' },
};

function AnimatedTab({ title, icon, selected, width, palette, activeText, activeIcon, inactiveText, onPress, onLongPress }: { title: string; icon: React.ComponentProps<typeof Ionicons>['name']; selected: boolean; width: number; palette: Readonly<Palette>; activeText: string; activeIcon: string; inactiveText: string; onPress: () => void; onLongPress: () => void }) {
  const progress = useSharedValue(selected ? 1 : 0);
  const pressed = useSharedValue(1);
  const reduced = useReducedMotion();
  useEffect(() => {
    progress.value = reduced ? (selected ? 1 : 0) : withTiming(selected ? 1 : 0, { duration: TAB_SELECTION_DURATION_MS, easing: Easing.out(Easing.cubic) });
  }, [progress, reduced, selected]);
  const tabStyle = useAnimatedStyle(() => ({
    width: interpolate(progress.value, [0, 1], [width, width * 2.7]),
    gap: interpolate(progress.value, [0, 1], [0, 6]),
    transform: [{ scale: pressed.value }],
  }), [width]);
  // Lotus `.tabs .tab.on`: the candy gradient pill fades in under the icon and label.
  const fillStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    maxWidth: interpolate(progress.value, [0, 1], [0, Math.max(0, width * 2.7 - 42)]),
    transform: [{ translateX: interpolate(progress.value, [0, 1], [-5, 0]) }],
  }), [width]);
  return <Animated.View style={[{ height: '100%', borderRadius: radii.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }, selected ? { boxShadow: `0px 8px 20px -6px ${palette.candyGlow}` } : null, tabStyle]}>
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: radii.pill }, candyStyle(palette, 'none'), fillStyle]}/>
    <Pressable accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={title} onPress={onPress} onLongPress={onLongPress}
      onPressIn={() => { pressed.set(reduced ? 1 : withTiming(0.98, { duration: PRESS_IN_DURATION_MS, easing: Easing.out(Easing.quad) })); }}
      onPressOut={() => { pressed.set(reduced ? 1 : withTiming(1, { duration: PRESS_OUT_DURATION_MS, easing: Easing.out(Easing.quad) })); }}
      style={{ width: '100%', height: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={20} color={selected ? activeIcon : inactiveText}/>
      <Animated.Text numberOfLines={1} style={[{ color: selected ? activeText : inactiveText, fontFamily: fonts.bold, fontSize: 12, includeFontPadding: false, overflow: 'hidden' }, labelStyle]}>{title}</Animated.Text>
    </Pressable>
  </Animated.View>;
}

function FloatingTabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const { language, appearance } = useApp();
  const { palette } = useVoltTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { reveal, setActiveRoute } = useTabMotion();
  useEffect(() => { setActiveRoute(state.routes[state.index]?.name ?? 'index'); }, [setActiveRoute, state.index, state.routes]);
  const barWidth = Math.min(width - 24, 540);
  const tabBaseWidth = Math.max(30, (barWidth - 10 - 16) / (5 + 1.7));
  const light = appearance === 'shore';
  // Prototype `.tabs`: 12px inset, 5px padding, 28px radius, 44px tabs, active tab flex 2.7.
  return <View style={{ position: 'absolute', bottom: 12 + insets.bottom, left: 12, right: 12, maxWidth: 540, alignSelf: 'center', height: 54, padding: 5, borderRadius: 28, backgroundColor: palette.navBackground, borderWidth: light ? 0 : 1, borderColor: 'rgba(255,255,255,0.07)',
    // Lotus `.tabs`: 0 12px 32px rgba(42,9,80,.14), 0 0 0 1px rgba(42,9,80,.04), 0 22px 46px -10px rgba(185,138,240,.55)
    boxShadow: light ? '0px 12px 32px rgba(42,9,80,0.14), 0px 0px 0px 1px rgba(42,9,80,0.04), 0px 22px 46px -10px rgba(185,138,240,0.55)' : '0px 12px 32px rgba(0,0,0,0.55), 0px 18px 40px -14px rgba(226,110,229,0.25)' }}>
    <View style={{ flex: 1, flexDirection: language === 'ar' ? 'row-reverse' : 'row', gap: 4 }}>
      {state.routes.map((route, index) => {
        const item = items[route.name];
        if (!item) return null;
        const active = state.index === index || (state.routes[state.index]?.name === 'profile' && route.name === 'index');
        const title = t(language, item.label);
        return <AnimatedTab key={route.key} title={title} icon={item.icon} selected={active} width={tabBaseWidth} palette={palette} activeText={palette.navActiveText} activeIcon={palette.navActiveIcon} inactiveText={palette.muted}
          onPress={() => { const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true }); if (state.index !== index && !event.defaultPrevented) { reveal(route.name); navigateToTab(route.key); } }}
          onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}/>;
      })}
    </View>
  </View>;
}

export default function Layout() {
  return <TabMotionProvider><Tabs tabBar={props => <FloatingTabBar {...props}/>} screenOptions={{ headerShown: false }}>
    {primaryTabRoutes.map(name => <Tabs.Screen key={name} name={name}/>)}
    {/* Secondary tabs stay navigable; the custom tab bar only draws routes listed in `items`. (`href: null` now hides AND redirects the route.) */}
    {secondaryTabRoutes.map(name => <Tabs.Screen key={name} name={name}/>)}
  </Tabs></TabMotionProvider>;
}
