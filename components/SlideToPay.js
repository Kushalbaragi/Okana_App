import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing, Extrapolation, interpolate, runOnJS, useAnimatedReaction, useAnimatedStyle, useReducedMotion, useSharedValue,
  withRepeat, withSpring, withTiming,
} from 'react-native-reanimated';
import { CheckIcon, ChevronRight } from './icons';
import { POSITIVE, dim } from './savingsShared';
import { hapticAdded, hapticTick } from '../utils/haptics';
import { reportError } from '../utils/errors';
import { FONT } from '../utils/type';

const HEIGHT = 56;
const BORDER = 1;
// The thumb fills the track's whole inner height, so it is the track's own
// rounded end — nothing sits around it.
const THUMB = HEIGHT - BORDER * 2;
// How far along the track a release still counts as "paid" — a deliberate
// drag, not a nudge, but not a pixel-perfect one either.
const COMPLETE_AT = 0.88;
// Haptic ticks as the thumb passes each quarter of the track.
const TICKS = 4;
// Close to critically damped: a barely-there settle, not a bounce.
const SETTLE = { damping: 26, stiffness: 300 };
const SNAP_MS = 120;
// One shimmer pass per SHIMMER_MS; SPREAD is how many letters the highlight spans.
const SHIMMER_MS = 2200;
const SPREAD = 3;

function ShimmerChar({ ch, i, n, phase, color, still }) {
  const style = useAnimatedStyle(() => {
    if (still) return { opacity: 1 };
    const d = phase.value * (n + SPREAD * 2) - SPREAD - i;
    return { opacity: 0.5 + 0.5 * Math.max(0, 1 - Math.abs(d) / SPREAD) };
  });
  return <Animated.Text style={[{ fontSize: FONT.body, fontWeight: '500', color }, style]}>{ch}</Animated.Text>;
}

// The hint, with a soft highlight sweeping across it letter by letter — a
// shimmer without needing a masked gradient view. Holds still (lit evenly) when
// the device asks for reduced motion.
function ShimmerLabel({ text, color, style }) {
  const reduceMotion = useReducedMotion();
  const phase = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return undefined;
    phase.value = withRepeat(withTiming(1, { duration: SHIMMER_MS, easing: Easing.linear }), -1, false);
    return () => { phase.value = 0; };
  }, [phase, reduceMotion]);
  const chars = Array.from(text);
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: THUMB, right: 16, flexDirection: 'row', justifyContent: 'center' }, style]}>
      {chars.map((ch, i) => <ShimmerChar key={i} ch={ch} i={i} n={chars.length} phase={phase} color={color} still={reduceMotion} />)}
    </Animated.View>
  );
}

// A drag-to-confirm control: a faint green wash follows the thumb, a light tick
// marks each quarter, and letting go short of the end springs it back. The
// thumb then stays parked at the end — the parent decides when the control
// changes (see `paid`), and only a payment that fails (`onComplete` resolving
// false, or throwing) sends it back. Once `paid` is true it is replaced by a
// quiet confirmation line, so the same slot can't be used to pay twice.
export default function SlideToPay({ label, paidLabel, paid, onComplete, light = false }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const x = useSharedValue(0);
  const max = Math.max(0, trackWidth - BORDER * 2 - THUMB);
  const lastTick = useSharedValue(0);
  // Set the moment a slide completes, so a second drag can't fire again while
  // the thumb is parked at the end waiting on the payment.
  const fired = useSharedValue(false);

  // A fresh cycle (paid -> not paid) starts the thumb back at the beginning.
  useEffect(() => {
    if (!paid) { x.value = 0; fired.value = false; }
  }, [paid, x, fired]);

  useAnimatedReaction(
    () => (max > 0 ? Math.floor((x.value / max) * TICKS) : 0),
    (tick) => {
      if (tick !== lastTick.value) {
        lastTick.value = tick;
        if (tick > 0 && tick < TICKS) runOnJS(hapticTick)();
      }
    },
  );

  const pay = async () => {
    hapticAdded();
    let ok = false;
    try {
      ok = (await onComplete()) !== false;
    } catch (e) {
      reportError(e);
    }
    if (!ok) {
      fired.value = false;
      x.value = withSpring(0, SETTLE);
    }
  };

  // The same commit for a drag past the threshold and for VoiceOver's
  // "activate", which has no drag to read.
  const commit = () => {
    if (fired.value) return;
    fired.value = true;
    x.value = withTiming(max, { duration: SNAP_MS }, (done) => { if (done) runOnJS(pay)(); });
  };

  const pan = Gesture.Pan()
    .enabled(!paid && max > 0)
    .activeOffsetX([-6, 6])
    .failOffsetY([-14, 14])
    .onChange((e) => {
      if (fired.value) return;
      x.value = Math.min(max, Math.max(0, x.value + e.changeX));
    })
    .onEnd(() => {
      if (fired.value) return;
      if (x.value >= max * COMPLETE_AT) {
        fired.value = true;
        x.value = withTiming(max, { duration: SNAP_MS }, (done) => { if (done) runOnJS(pay)(); });
      } else {
        x.value = withSpring(0, SETTLE);
      }
    });

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  // Nothing green until the thumb moves; then a faint wash grows with it.
  const fillStyle = useAnimatedStyle(() => ({
    width: x.value + THUMB / 2,
    opacity: max > 0 ? Math.min(1, x.value / (max * 0.6)) : 0,
  }));
  const hintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [0, Math.max(1, max * 0.5)], [1, 0], Extrapolation.CLAMP),
  }));

  if (paid) {
    return (
      <View
        style={{ height: HEIGHT, borderRadius: HEIGHT / 2, backgroundColor: 'rgba(74,222,128,0.10)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        accessibilityRole="text"
      >
        <CheckIcon size={16} color={POSITIVE} />
        <Text style={{ fontSize: FONT.body, fontWeight: '500', color: POSITIVE }}>{paidLabel}</Text>
      </View>
    );
  }

  return (
    <GestureDetector gesture={pan}>
      <View
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityHint="Swipe right to pay"
        accessibilityActions={[{ name: 'activate', label: 'Pay EMI' }]}
        onAccessibilityAction={commit}
        style={{ height: HEIGHT, borderRadius: HEIGHT / 2, backgroundColor: dim(light, 0.16), borderWidth: BORDER, borderColor: dim(light, 0.12), overflow: 'hidden', justifyContent: 'center' }}
      >
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0, bottom: 0, borderTopLeftRadius: HEIGHT / 2, borderBottomLeftRadius: HEIGHT / 2, backgroundColor: 'rgba(74,222,128,0.55)' }, fillStyle]} />
        <ShimmerLabel text={label} color={light ? '#111111' : '#ffffff'} style={hintStyle} />
        <Animated.View
          style={[{ position: 'absolute', left: 0, width: THUMB, height: THUMB, borderRadius: THUMB / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: light ? '#111111' : '#ffffff' }, thumbStyle]}
        >
          <ChevronRight size={20} color={light ? '#ffffff' : '#111111'} />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
