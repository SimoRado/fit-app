import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, PanResponder, Platform, ScrollView, useWindowDimensions, View } from 'react-native';
import { TapPressable as Pressable } from './MotionPressable';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../state/app';
import { localize } from '../core/i18n';
import { sheetDragOffset, sheetShouldClaim, sheetShouldDismiss } from '../core/sheetGesture';
import { MOTION } from '../core/pressMotion';
import { Text } from './LocalizedText';
import { useReducedMotion } from './motion';
import { colors, fonts } from './theme';

type CloseSheet = (after?: () => void) => void;

/**
 * Shared bottom sheet. In both layouts the drag handle, title and close button
 * sit in a fixed header outside any scroll view, so they stay visible at every
 * scroll position; dragging that header (handle, title row) down dismisses the
 * sheet. The drag follows the finger, closes past a distance or on a downward
 * flick (`core/sheetGesture`), and springs back otherwise. It runs the very same
 * `close()` as the X button, so any dismissal guard a screen puts in `onClose`
 * applies to both.
 *
 * `layout="scroll"` (default): the content below the header scrolls.
 * `layout="fixed"`: the child owns the remaining height and provides its own
 * scroll area and footer.
 */
export function BottomSheet({ visible, title, onClose, children, layout = 'scroll', fixedHeight = '90%', stableHeight }: { visible: boolean; title: string; onClose: () => void; children: (close: CloseSheet) => React.ReactNode; layout?: 'scroll' | 'fixed'; fixedHeight?: '60%' | '82%' | '90%'; /** Scroll layout at a fixed height, so loading and loaded content never resize the sheet. */ stableHeight?: '88%' }) {
  const { language } = useApp();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(0));
  const [drag] = useState(() => new Animated.Value(0));
  const [closing, setClosing] = useState(false);
  // `mounted` keeps the Modal on screen after `visible` turns false until the slide-down finishes,
  // so screens that close a sheet by flipping their own state still get the exit animation.
  // Once hidden, the Modal is unmounted: nothing invisible is left to block touches.
  const [mounted, setMounted] = useState(visible);
  const lowered = useRef(false); // true while the sheet sits fully off-screen (progress 0)
  const visibleRef = useRef(visible);
  useEffect(() => { visibleRef.current = visible; }, [visible]);
  useEffect(() => {
    if (visible) {
      lowered.current = false;
      setMounted(true);
      drag.setValue(0);
      progress.setValue(reduced ? 1 : 0);
      if (!reduced) Animated.timing(progress, { toValue: 1, duration: MOTION.sheetOpen, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      return;
    }
    // Already slid down by close(), or reduced motion: unmount now.
    if (reduced || lowered.current) { setMounted(false); setClosing(false); return; }
    // Closed from outside (e.g. after a save): play the same exit, then unmount.
    Animated.timing(progress, { toValue: 0, duration: MOTION.sheetClose, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => { if (!visibleRef.current) { setMounted(false); setClosing(false); } });
  }, [visible, reduced, progress, drag]);
  // After close(): if the screen's dismissal guard (e.g. "Discard changes?") kept `visible` true,
  // bring the sheet back up. Runs after commit, so it sees the parent's final `visible`.
  const [closeRequest, setCloseRequest] = useState(0);
  useEffect(() => {
    if (!closeRequest || !visible || !lowered.current) return;
    lowered.current = false; setClosing(false);
    if (reduced) progress.setValue(1); else Animated.timing(progress, { toValue: 1, duration: MOTION.sheetOpen, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [closeRequest, visible, reduced, progress]);
  function close(after?: () => void) {
    if (closing) return;
    setClosing(true);
    const finish = () => { lowered.current = true; setCloseRequest(value => value + 1); onClose(); after?.(); };
    if (reduced) { finish(); return; }
    Animated.timing(progress, { toValue: 0, duration: MOTION.sheetClose, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => { if (finished) finish(); });
  }
  // Drag-to-dismiss on the fixed header only, so it never competes with the content's scrolling,
  // calendar taps or buttons. Created once; `closeRef` always calls the latest `close`.
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; });
  // The ref is only read inside the gesture callbacks (never during render); one responder must
  // survive re-renders, or a re-render mid-drag would reset its gesture state.
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() => {
    const settle = () => Animated.spring(drag, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
    return PanResponder.create({
      // Capture phase: the title text and X button must not swallow a downward drag. A plain tap
      // never moves past the claim distance, so the X button still receives its press.
      onMoveShouldSetPanResponderCapture: (_, g) => sheetShouldClaim(g.dx, g.dy),
      onMoveShouldSetPanResponder: (_, g) => sheetShouldClaim(g.dx, g.dy),
      // Once dragging, keep the gesture (Android would otherwise hand it to a parent mid-drag).
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => { drag.setValue(sheetDragOffset(g.dy)); },
      onPanResponderRelease: (_, g) => { if (sheetShouldDismiss(g.dy, g.vy)) closeRef.current(); else settle(); },
      onPanResponderTerminate: settle,
    });
  });
  const fixed = layout === 'fixed';
  const light = colors.light;
  const header = <View {...pan.panHandlers} style={{ paddingHorizontal: 20, paddingTop: 2, paddingBottom: fixed ? 6 : 8, gap: 4 }}>
    {/* Handle: the visible bar stays 40×4; its touch area spans the header width and ~22 px tall. */}
    <View accessible={false} style={{ alignSelf: 'stretch', height: 22, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line3, opacity: 0.55 }}/>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <Text accessibilityRole="header" style={{ flex: 1, color: colors.text, fontFamily: fonts.displayHeavy, fontSize: 26, lineHeight: 31, letterSpacing: -0.7 }}>{title}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={localize('Cancel', language)} hitSlop={6} onPress={() => close()}
        style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: light ? colors.c8 : colors.card2, ...(light ? { boxShadow: '0px 2px 10px rgba(11,20,70,0.10)' } : {}) }}>
        <Ionicons name="close" size={20} color={colors.text}/>
      </Pressable>
    </View>
  </View>;
  if (!mounted && !visible) return null;
  return <Modal visible transparent animationType="none" onRequestClose={() => close()} statusBarTranslucent navigationBarTranslucent={fixed}>
    <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: colors.accentInk, opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, .42] }) }}/>
      <Pressable accessibilityRole="button" accessibilityLabel={localize('Cancel', language)} onPress={() => close()} style={{ flex: 1, minHeight: insets.top + 24 }}/>
      <Animated.View pointerEvents={closing ? 'none' : 'auto'} style={{ ...(fixed ? { height: fixedHeight } : stableHeight ? { height: stableHeight } : { maxHeight: '88%' as const }), width: '100%', maxWidth: 620, alignSelf: 'center', backgroundColor: light ? colors.bg : colors.card, borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: 'hidden', transform: [{ translateY: Animated.add(progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }), drag) }] }}>
        <View style={{ flexShrink: 1, ...(fixed || stableHeight ? { flex: 1 } : {}), direction: language === 'ar' ? 'rtl' : 'ltr' }}>
          {header}
          {/* `close` is only invoked from presses and gestures, never during render. */}
          {/* eslint-disable-next-line react-hooks/refs */}
          {fixed ? <View style={{ flex: 1 }}>{children(close)}</View>
            : <ScrollView style={stableHeight ? { flex: 1 } : { flexShrink: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: Math.max(24, insets.bottom + 12), gap: 12 }}>
              {/* eslint-disable-next-line react-hooks/refs */}
              {children(close)}
            </ScrollView>}
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  </Modal>;
}
