import React, { useEffect, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../state/app';
import { localize } from '../core/i18n';
import { Text } from './LocalizedText';
import { useReducedMotion } from './motion';
import { colors, fonts } from './theme';

type CloseSheet = (after?: () => void) => void;
/** Distance (px) or fling speed past which a downward drag on the header closes the sheet. */
const DISMISS_DISTANCE = 110, DISMISS_VELOCITY = 1.1;

/**
 * Shared bottom sheet. In both layouts the drag handle, title and close button
 * sit in a fixed header outside any scroll view, so they stay visible at every
 * scroll position; dragging that header down dismisses the sheet.
 *
 * `layout="scroll"` (default): the content below the header scrolls.
 * `layout="fixed"`: the child owns the remaining height and provides its own
 * scroll area and footer.
 */
export function BottomSheet({ visible, title, onClose, children, layout = 'scroll', fixedHeight = '90%' }: { visible: boolean; title: string; onClose: () => void; children: (close: CloseSheet) => React.ReactNode; layout?: 'scroll' | 'fixed'; fixedHeight?: '60%' | '82%' | '90%' }) {
  const { language } = useApp();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(0));
  const [drag] = useState(() => new Animated.Value(0));
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (!visible) return;
    drag.setValue(0);
    progress.setValue(reduced ? 1 : 0);
    if (!reduced) Animated.timing(progress, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [visible, reduced, progress, drag]);
  function close(after?: () => void) {
    if (closing) return;
    setClosing(true);
    const finish = () => { setClosing(false); onClose(); after?.(); };
    if (reduced) { finish(); return; }
    Animated.timing(progress, { toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => { if (finished) finish(); });
  }
  // Drag-to-dismiss on the fixed header only, so it never competes with the content's scrolling.
  const pan = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => { drag.setValue(Math.max(0, g.dy)); },
    onPanResponderRelease: (_, g) => {
      if (g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY) close();
      else Animated.spring(drag, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
    },
    onPanResponderTerminate: () => { Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start(); },
  });
  const fixed = layout === 'fixed';
  const light = colors.light;
  const header = <View {...pan.panHandlers} style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: fixed ? 6 : 8, gap: 12 }}>
    <View accessible={false} style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line3, opacity: 0.55, alignSelf: 'center' }}/>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <Text accessibilityRole="header" style={{ flex: 1, color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 26, lineHeight: 31, letterSpacing: -0.7 }}>{title}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={localize('Cancel', language)} hitSlop={6} onPress={() => close()}
        style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: light ? colors.c8 : colors.card2, ...(light ? { boxShadow: '0px 2px 10px rgba(11,20,70,0.10)' } : {}) }}>
        <Ionicons name="close" size={20} color={colors.text}/>
      </Pressable>
    </View>
  </View>;
  return <Modal visible={visible} transparent animationType="none" onRequestClose={() => close()} statusBarTranslucent navigationBarTranslucent={fixed}>
    <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: colors.accentInk, opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, .42] }) }}/>
      <Pressable accessibilityRole="button" accessibilityLabel={localize('Cancel', language)} onPress={() => close()} style={{ flex: 1, minHeight: insets.top + 24 }}/>
      <Animated.View pointerEvents={closing ? 'none' : 'auto'} style={{ ...(fixed ? { height: fixedHeight } : { maxHeight: '88%' as const }), width: '100%', maxWidth: 620, alignSelf: 'center', backgroundColor: light ? colors.bg : colors.card, borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: 'hidden', transform: [{ translateY: Animated.add(progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }), drag) }] }}>
        <View style={{ flexShrink: 1, ...(fixed ? { flex: 1 } : {}), direction: language === 'ar' ? 'rtl' : 'ltr' }}>
          {header}
          {fixed ? <View style={{ flex: 1 }}>{children(close)}</View>
            : <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: Math.max(24, insets.bottom + 12), gap: 12 }}>
              {children(close)}
            </ScrollView>}
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  </Modal>;
}
