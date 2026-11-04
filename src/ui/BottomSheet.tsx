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
export function BottomSheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: (close: CloseSheet) => React.ReactNode }) {
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
  return <Modal visible={visible} transparent animationType="none" onRequestClose={() => close()} statusBarTranslucent>
    <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: '#000', opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, .68] }) }}/>
      <Pressable accessibilityRole="button" accessibilityLabel={localize('Cancel', language)} onPress={() => close()} style={{ flex: 1 }}/>
      <Animated.View style={{ maxHeight: '85%', width: '100%', maxWidth: 620, alignSelf: 'center', backgroundColor: colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden', borderTopColor: colors.accent, borderTopWidth: 2, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) }] }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 14, paddingBottom: Math.max(24, insets.bottom + 12), gap: 16, direction: language === 'ar' ? 'rtl' : 'ltr' }}>
          <View style={{ width: 42, height: 3, backgroundColor: colors.border, alignSelf: 'center' }}/>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><Text style={{ flex: 1, color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 36, lineHeight: 38, textTransform: 'uppercase' }}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel={localize('Cancel', language)} onPress={() => close()} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="close" size={25} color={colors.text}/></Pressable></View>
          {children(close)}
        </ScrollView>
      </Animated.View>
    </KeyboardAvoidingView>
  </Modal>;
}
