import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, runOnUI, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { SWIPE, clampIndex, dragOffset, releaseVelocity, stepIndex, swipeDecision } from '../../core/motivationDeck';

/**
 * Volt Motivation card deck — a native port of the prototype's `.stage` / `.mwrap` deck.
 *
 * Measured from the prototype in the browser: the card follows the finger 1:1 with
 * `rotate(dx / 24 deg)`; releasing past 70 px commits, sending the card to ±420 px while it fades
 * over 230 ms (CSS `ease`); a short drag springs back. The resting back card sits at
 * `scale(.94) translateY(14px)` and 55 % opacity.
 *
 * Native refinements (requested for the app): the card underneath grows from that resting pose to
 * full size as the front card moves away, so when the exit finishes it is already exactly where the
 * new front card must be; dragging right reveals the previous card instead of the next one; the
 * deck does not wrap; fast flicks commit; and the arrow buttons run the very same exit animation.
 *
 * Everything per-frame runs on the UI thread: the pan gesture writes `drag`, and each layer derives
 * its transform from `drag` + `active` in `useAnimatedStyle`. When the exit ends, `active` and
 * `drag` are swapped in the same UI frame (no blank or duplicated frame) and only then is React told
 * about the new index — which merely shifts the rendered window; layers are keyed by card, so
 * nothing remounts.
 */
export type SwipeDeckHandle = { go: (dir: 1 | -1) => void };
type Props = {
  count: number; initialIndex: number; width: number; height: number; reducedMotion: boolean;
  keyFor: (index: number) => string; renderCard: (index: number) => React.ReactNode;
  onIndexChange: (index: number) => void;
  /** Card surface colour: Android needs a background on the layer to cast its elevation shadow. */
  surface: string;
  accessibilityLabel?: string;
};

const exitEasing = Easing.bezier(0.25, 0.1, 0.25, 1); // CSS `ease`, as in the prototype
const settle = { damping: 26, stiffness: 320, mass: 0.9, overshootClamping: false } as const; // subtle, ~1 % overshoot
const WINDOW = 2;

export const SwipeDeck = forwardRef<SwipeDeckHandle, Props>(function SwipeDeck({ count, initialIndex, width, height, reducedMotion, keyFor, renderCard, onIndexChange, surface, accessibilityLabel }, ref) {
  const [index, setIndex] = useState(() => clampIndex(initialIndex, count));
  const active = useSharedValue(index);
  const total = useSharedValue(count);
  const drag = useSharedValue(0);
  const start = useSharedValue(0);
  const fade = useSharedValue(1);
  const backIn = useSharedValue(1);
  const reveal = useSharedValue(0);
  const revealDir = useSharedValue(0);
  const busy = useSharedValue(false);
  const tracking = useSharedValue(false);
  /** One arrow press made during a transition runs right after it (in order; never more than one). */
  const pending = useSharedValue(0);
  /** Drag position ~60–120 ms ago, for a release velocity that does not depend on the last event. */
  const sampleX = useSharedValue(0);
  const sampleT = useSharedValue(0);
  const reduced = useSharedValue(reducedMotion);
  const exit = Math.max(SWIPE.exitDistance, width * 1.25);

  useEffect(() => { reduced.value = reducedMotion; }, [reducedMotion, reduced]);

  const goRef = useRef<(dir: number) => void>(() => {});
  const publish = useCallback((next: number) => {
    setIndex(next); onIndexChange(next);
    const queued = pending.value;
    if (queued !== 0) { pending.value = 0; goRef.current(queued); }
  }, [onIndexChange, pending]);

  // The allowance can change while open (upgrade → more cards, expiry → fewer). Keep the logical
  // index valid without animating or remounting.
  useEffect(() => {
    total.value = count;
    if (index >= count && count > 0) { const next = count - 1; active.value = next; drag.value = 0; fade.value = 1; publish(next); }
  }, [count, index, total, active, drag, fade, publish]);

  const swap = useCallback((dir: number) => {
    'worklet';
    const next = active.value + dir;
    active.value = next; drag.value = 0; fade.value = 1; reveal.value = 0; revealDir.value = 0;
    backIn.value = 0;
    backIn.value = withTiming(1, { duration: 260, easing: exitEasing });
    busy.value = false;
    runOnJS(publish)(next);
  }, [active, drag, fade, reveal, revealDir, backIn, busy, publish]);

  const commit = useCallback((dir: number, velocity: number) => {
    'worklet';
    busy.value = true;
    if (reduced.value) {
      // Reduced motion: no flying card — a short cross-fade to the adjacent card.
      drag.value = withTiming(0, { duration: 120 });
      revealDir.value = dir;
      reveal.value = withTiming(1, { duration: 160 });
      fade.value = withTiming(0, { duration: 160 }, () => swap(dir));
      return;
    }
    const target = dir === 1 ? -exit : exit;
    const remaining = Math.abs(target - drag.value);
    const speed = Math.abs(velocity);
    // A fast flick keeps its momentum (shorter exit); otherwise the prototype's 230 ms.
    const duration = speed > 0 ? Math.max(150, Math.min(SWIPE.exitMs, (remaining / speed) * 1000 * 1.6)) : SWIPE.exitMs;
    fade.value = withTiming(0, { duration, easing: exitEasing });
    drag.value = withTiming(target, { duration, easing: exitEasing }, () => swap(dir));
  }, [busy, reduced, drag, revealDir, reveal, fade, swap, exit]);

  const nudge = useCallback((dir: number) => {
    'worklet';
    if (busy.value || tracking.value || reduced.value) return;
    drag.value = withSequence(withTiming(dir === 1 ? -16 : 16, { duration: 90, easing: exitEasing }), withSpring(0, settle));
  }, [busy, tracking, reduced, drag]);

  const goOnUI = useCallback((dir: number) => {
    'worklet';
    if (tracking.value) return;
    if (busy.value) { pending.value = dir; return; } // one transition at a time; the next press waits
    const from = active.value;
    if (stepIndex(from, dir, total.value) === from) { nudge(dir); return; }
    commit(dir, 0);
  }, [busy, tracking, pending, active, total, nudge, commit]);

  useEffect(() => { goRef.current = dir => runOnUI(goOnUI)(dir); }, [goOnUI]);
  useImperativeHandle(ref, () => ({ go: dir => runOnUI(goOnUI)(dir) }), [goOnUI]);

  const pan = usePanGesture({
    activeOffsetX: [-8, 8],
    failOffsetY: [-14, 14],
    onActivate: () => {
      'worklet';
      tracking.value = !busy.value;
      start.value = drag.value; // grabbing a card mid-spring continues from where it is
      sampleX.value = drag.value; sampleT.value = Date.now();
    },
    onUpdate: event => {
      'worklet';
      if (!tracking.value) return;
      const i = active.value;
      const x = dragOffset(start.value + event.translationX, i > 0, i < total.value - 1);
      const now = Date.now();
      if (now - sampleT.value > 60) { sampleX.value = drag.value; sampleT.value = now; }
      drag.value = x;
    },
    onDeactivate: event => {
      'worklet';
      if (!tracking.value) return;
      tracking.value = false;
      const i = active.value;
      const vx = releaseVelocity(event.velocityX, drag.value - sampleX.value, Date.now() - sampleT.value);
      const dir = swipeDecision(drag.value, vx, i > 0, i < total.value - 1);
      if (dir !== 0) commit(dir, vx);
      else drag.value = withSpring(0, { ...settle, velocity: vx });
    },
    onFinalize: () => {
      'worklet';
      // Cancelled (e.g. the scroll view took over): put the card back.
      if (!tracking.value) return;
      tracking.value = false;
      drag.value = withSpring(0, settle);
    },
  });

  const first = Math.max(0, index - WINDOW), last = Math.min(count - 1, index + WINDOW);
  const slots: number[] = [];
  for (let i = first; i <= last; i++) slots.push(i);

  return <GestureHandlerRootView style={{ width, height }}>
    <GestureDetector gesture={pan}>
      <View style={{ width, height }} accessible accessibilityRole="adjustable" accessibilityLabel={accessibilityLabel}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={event => runOnUI(goOnUI)(event.nativeEvent.actionName === 'increment' ? 1 : -1)}>
        {slots.map(slot => <DeckLayer key={keyFor(slot)} slot={slot} width={width} height={height} surface={surface} active={active} drag={drag} fade={fade} backIn={backIn} reveal={reveal} revealDir={revealDir}>
          {renderCard(slot)}
        </DeckLayer>)}
      </View>
    </GestureDetector>
  </GestureHandlerRootView>;
});

type LayerProps = { slot: number; width: number; height: number; surface: string; children: React.ReactNode; active: SharedValue<number>; drag: SharedValue<number>; fade: SharedValue<number>; backIn: SharedValue<number>; reveal: SharedValue<number>; revealDir: SharedValue<number> };

const DeckLayer = memo(function DeckLayer({ slot, width, height, surface, children, active, drag, fade, backIn, reveal, revealDir }: LayerProps) {
  // Android draws siblings by elevation (Z) first, so the front card always gets the highest
  // elevation; zIndex keeps the same order on iOS.
  const style = useAnimatedStyle(() => {
    const rel = slot - active.value;
    const d = drag.value;
    if (rel === 0) {
      return { opacity: fade.value, zIndex: 10, elevation: 12, transform: [{ translateX: d }, { translateY: 0 }, { rotate: `${d / SWIPE.rotateDivisor}deg` }, { scale: 1 }] };
    }
    if (rel === 1 || rel === -1) {
      // `toward` > 0 when the drag uncovers this side: dragging left uncovers the next card.
      const toward = -rel * d;
      let appear = rel === 1 ? 1 : 0;
      if (rel === -1 && toward > 0) appear = Math.min(1, toward / 30);
      if (rel === 1 && toward < 0) appear = Math.max(0, 1 + toward / 30);
      let progress = Math.min(1, Math.max(0, toward / SWIPE.revealDistance));
      if (revealDir.value === rel) { progress = Math.max(progress, reveal.value); appear = 1; }
      else if (revealDir.value === -rel) appear = 0;
      const base = 0.55 * appear * backIn.value;
      return { opacity: base + (1 - base) * progress, zIndex: 5, elevation: 2 + 4 * progress, transform: [{ translateX: 0 }, { translateY: 14 * (1 - progress) }, { rotate: '0deg' }, { scale: 0.94 + 0.06 * progress }] };
    }
    return { opacity: 0, zIndex: 0, elevation: 0, transform: [{ translateX: 0 }, { translateY: 14 }, { rotate: '0deg' }, { scale: 0.94 }] };
  });
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.layer, { width, height, backgroundColor: surface }, style]}>{children}</Animated.View>;
});

const styles = StyleSheet.create({
  layer: { borderRadius: 28, shadowColor: '#0B1446', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
});
