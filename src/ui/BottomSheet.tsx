import React, { useEffect, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../state/app';
import { localize } from '../core/i18n';
import { Text } from './LocalizedText';
import { useReducedMotion } from './motion';
import { colors, fonts } from './theme';

type CloseSheet = (after?: () => void) => void;
/**
 * `layout="scroll"` (default): the whole sheet, header included, scrolls.
 * `layout="fixed"`: handle, title and close stay pinned; the child owns the
 * remaining height and provides its own scroll area and footer.
 */
export function BottomSheet({ visible, title, onClose, children, layout = 'scroll', fixedHeight = '90%' }: { visible: boolean; title: string; onClose: () => void; children: (close: CloseSheet) => React.ReactNode; layout?: 'scroll' | 'fixed'; fixedHeight?: '60%' | '82%' | '90%' }) {
  const { language } = useApp();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(0));
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (!visible) return;
    progress.setValue(reduced ? 1 : 0);
    if (!reduced) Animated.timing(progress, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [visible, reduced, progress]);
  function close(after?: () => void) {
    if (closing) return;
    setClosing(true);
    const finish = () => { setClosing(false); onClose(); after?.(); };
    if (reduced) { finish(); return; }
    Animated.timing(progress, { toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => { if (finished) finish(); });
  }
  const fixed = layout === 'fixed';
  const header = <>
    <View style={{ width: 42, height: 4, borderRadius: 2, backgroundColor: colors.line3, alignSelf: 'center' }}/>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><Text style={{ flex: 1, color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 22, lineHeight: 27, letterSpacing: -0.5 }}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel={localize('Cancel', language)} hitSlop={6} onPress={() => close()} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: colors.bg === '#F5F9FF' ? colors.soft1 : colors.card2 }}><Ionicons name="close" size={20} color={colors.text}/></Pressable></View>
  </>;
  return <Modal visible={visible} transparent animationType="none" onRequestClose={() => close()} statusBarTranslucent navigationBarTranslucent={fixed}>
    <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: colors.accentInk, opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, .42] }) }}/>
      <Pressable accessibilityRole="button" accessibilityLabel={localize('Cancel', language)} onPress={() => close()} style={{ flex: 1, minHeight: insets.top + 24 }}/>
      <Animated.View style={{ ...(fixed ? { height: fixedHeight } : { maxHeight: '85%' as const }), width: '100%', maxWidth: 620, alignSelf: 'center', backgroundColor: colors.bg === '#F5F9FF' ? colors.c8 : colors.card, borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: 'hidden', transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) }] }}>
        {fixed ? <View style={{ flex: 1, direction: language === 'ar' ? 'rtl' : 'ltr' }}>
          <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6, gap: 12 }}>{header}</View>
          <View style={{ flex: 1 }}>{children(close)}</View>
        </View> : <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: Math.max(24, insets.bottom + 12), gap: 12, direction: language === 'ar' ? 'rtl' : 'ltr' }}>
          {header}
          {children(close)}
        </ScrollView>}
      </Animated.View>
    </KeyboardAvoidingView>
  </Modal>;
}
