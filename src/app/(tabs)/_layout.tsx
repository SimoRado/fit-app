import React, { useEffect } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, interpolate, interpolateColor, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useApp } from '../../state/app';
import { Key, t } from '../../core/i18n';
import { colors, fonts, radii, shadows } from '../../ui/theme';
import { TabMotionProvider, useReducedMotion, useTabMotion } from '../../ui/motion';

const items: Record<string, { label: Key; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  index: { label: 'home', icon: 'home-outline' },
  workouts: { label: 'workouts', icon: 'barbell-outline' },
  nutrition: { label: 'nutrition', icon: 'restaurant-outline' },
  habits: { label: 'habits', icon: 'checkmark-circle-outline' },
  progress: { label: 'progress', icon: 'stats-chart-outline' },
};

function AnimatedTab({ title, icon, selected, width, onPress, onLongPress }: { title: string; icon: React.ComponentProps<typeof Ionicons>['name']; selected: boolean; width: number; onPress: () => void; onLongPress: () => void }) {
  const progress = useSharedValue(selected ? 1 : 0);
  const pressed = useSharedValue(1);
  const reduced = useReducedMotion();
  useEffect(() => {
    progress.value = reduced ? (selected ? 1 : 0) : withSpring(selected ? 1 : 0, { damping: 12, stiffness: 155, mass: 0.75, overshootClamping: false, energyThreshold: 0.001 });
  }, [progress, reduced, selected]);
  const tabStyle = useAnimatedStyle(() => ({
    width: interpolate(progress.value, [0, 1], [width, width * 2.7]),
    gap: interpolate(progress.value, [0, 1], [0, 7]),
    backgroundColor: interpolateColor(progress.value, [0, 1], ['rgba(255,200,61,0)', colors.sun]),
    transform: [{ scale: pressed.value }],
  }), [width]);
  const labelStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    maxWidth: interpolate(progress.value, [0, 1], [0, Math.max(0, width * 2.7 - 42)]),
    transform: [{ translateX: interpolate(progress.value, [0, 1], [-5, 0]) }],
  }), [width]);
  return <Animated.View style={[{ height: '100%', borderRadius: radii.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, tabStyle]}>
    <Pressable accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={title} onPress={onPress} onLongPress={onLongPress}
      onPressIn={() => { pressed.set(reduced ? 1 : withTiming(0.94, { duration: 110, easing: Easing.out(Easing.quad) })); }}
      onPressOut={() => { pressed.set(reduced ? 1 : withSpring(1, { damping: 14, stiffness: 250 })); }}
      style={{ width: '100%', height: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={selected ? 21 : 20} color={selected ? colors.ink : colors.muted}/>
      <Animated.Text numberOfLines={1} style={[{ color: colors.ink, fontFamily: fonts.bold, fontSize: 12.5, includeFontPadding: false, overflow: 'hidden' }, labelStyle]}>{title}</Animated.Text>
    </Pressable>
  </Animated.View>;
}

function FloatingTabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const { language } = useApp();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { reveal, setActiveRoute } = useTabMotion();
  useEffect(() => { setActiveRoute(state.routes[state.index]?.name ?? 'index'); }, [setActiveRoute, state.index, state.routes]);
  const barWidth = Math.min(width - 28, 540);
  const tabBaseWidth = Math.max(30, (barWidth - 12 - 16) / (5 + 1.7));
  return <View style={{ position: 'absolute', bottom: 14 + insets.bottom, left: 14, right: 14, maxWidth: 540, alignSelf: 'center', height: 68, padding: 6, borderRadius: 34, backgroundColor: 'rgba(255,255,255,0.9)', ...shadows.dock }}>
    <View style={{ flex: 1, flexDirection: language === 'ar' ? 'row-reverse' : 'row', gap: 4 }}>
      {state.routes.map((route, index) => {
        const item = items[route.name];
        if (!item) return null;
        const active = state.index === index || (state.routes[state.index]?.name === 'profile' && route.name === 'index');
        const title = t(language, item.label);
        return <AnimatedTab key={route.key} title={title} icon={item.icon} selected={active} width={tabBaseWidth}
          onPress={() => { const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true }); if (state.index !== index && !event.defaultPrevented) { reveal(route.name); navigateToTab(route.key); } }}
          onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}/>;
      })}
    </View>
  </View>;
}

export default function Layout() {
  return <TabMotionProvider><Tabs tabBar={props => <FloatingTabBar {...props}/>} screenOptions={{ headerShown: false }}>
    {Object.keys(items).map(name => <Tabs.Screen key={name} name={name}/>)}
    <Tabs.Screen name="profile" options={{ href: null }}/>
  </Tabs></TabMotionProvider>;
}
