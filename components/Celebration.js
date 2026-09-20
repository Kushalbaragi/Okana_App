import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { reportError } from '../utils/errors';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

// How long the message stays up. A tap anywhere ends it sooner.
const TOTAL_MS = 9000;
// The confetti goes off once and is thrown out, then falls under gravity until
// it has left the screen; this is how long that takes, after which the message
// is left on its own until it closes.
const BURST_MS = 2600;
// px/s² pulling every piece down, and how quickly its sideways speed dies away.
const GRAVITY = 1100;
const DRAG = 2.2;
const PIECES = 28;
const COLORS = ['#4ade80', '#facc15', '#f472b6', '#60a5fa', '#fb923c', '#a78bfa', '#f87171', '#2dd4bf', 'rgba(255,255,255,0.9)'];
// A dark tint over the page rather than a real blur — the app dropped
// BlurView on purpose (see Glass.js), and AddModal dims its backdrop the same
// way.
const SCRIM = 'rgba(0,0,0,0.92)';
const FADE_IN_MS = 500;
const FADE_OUT_MS = 700;

// Cheap deterministic spread, so the burst is the same every time and there is
// no per-render randomness to keep stable.
const spread = (i, salt) => {
  const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

function Piece({ t, vx, vy, size, color, round, spin }) {
  const style = useAnimatedStyle(() => {
    const tau = Math.min(t.value * TOTAL_MS, BURST_MS) / 1000;
    // Thrown out, sideways speed bleeding off, then a free fall — no fading on
    // the way, it simply drops out of sight.
    return {
      transform: [
        { translateX: (vx / DRAG) * (1 - Math.exp(-DRAG * tau)) },
        { translateY: vy * tau + 0.5 * GRAVITY * tau * tau },
        { rotate: `${spin * tau}deg` },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        { position: 'absolute', width: size, height: round ? size : size * 0.5, borderRadius: round ? size / 2 : 2, backgroundColor: color },
        style,
      ]}
    />
  );
}

// A congratulation written straight onto a darkened screen, with a single
// burst of confetti out from behind it. `note` is a small line under the
// subtitle. Shown in a transparent Modal so it covers the whole device — header
// and status bar included — and the text sits at the true centre of it. Gone on
// its own after TOTAL_MS; a tap dismisses it early. `onDone` says when it can be
// unmounted.
export default function Celebration({ title, subtitle, note, onDone }) {
  const t = useSharedValue(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  // The pieces are unmounted once they have all fallen away.
  const [bursting, setBursting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then(r => { if (!cancelled) setReduceMotion(r); }).catch(reportError);
    t.value = withTiming(1, { duration: TOTAL_MS, easing: Easing.linear });
    const done = setTimeout(onDone, TOTAL_MS + 50);
    const burstOver = setTimeout(() => setBursting(false), BURST_MS + 100);
    return () => { cancelled = true; clearTimeout(done); clearTimeout(burstOver); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pieces = useMemo(() => Array.from({ length: PIECES }, (_, i) => {
    const angle = spread(i, 1) * Math.PI * 2;
    const speed = 250 + spread(i, 2) * 270;
    return {
      vx: Math.cos(angle) * speed,
      // A little extra kick upward, so the burst opens up before it drops.
      vy: Math.sin(angle) * speed - 120,
      size: 4 + spread(i, 3) * 4,
      color: COLORS[i % COLORS.length],
      round: i % 3 !== 0,
      spin: (spread(i, 4) - 0.5) * 720,
    };
  }), []);

  const scrimStyle = useAnimatedStyle(() => {
    const ms = t.value * TOTAL_MS;
    return { opacity: Math.min(1, ms / FADE_IN_MS, (TOTAL_MS - ms) / FADE_OUT_MS) };
  });
  const textStyle = useAnimatedStyle(() => {
    const ms = t.value * TOTAL_MS;
    const inn = Math.min(1, ms / FADE_IN_MS);
    return { opacity: Math.min(inn, (TOTAL_MS - ms) / FADE_OUT_MS), transform: [{ scale: 0.94 + 0.06 * inn }] };
  });

  return (
    <Modal transparent animationType="none" statusBarTranslucent visible onRequestClose={onDone}>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: SCRIM }, scrimStyle]} />
        <Pressable style={StyleSheet.absoluteFill} onPress={onDone} accessibilityRole="button" accessibilityLabel="Dismiss" />

        {/* Both the burst and the text are centred in the same box, so the
            confetti opens from the middle of the message. */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          <View style={{ width: 0, height: 0 }}>
            {!reduceMotion && bursting && pieces.map((p, i) => <Piece key={i} t={t} {...p} />)}
          </View>
          <Animated.View style={[{ position: 'absolute', alignItems: 'center', paddingHorizontal: 32 }, textStyle]}>
            <Text style={{ fontSize: 24, fontWeight: '600', letterSpacing: -0.3, color: '#ffffff', textAlign: 'center' }}>{title}</Text>
            {!!subtitle && <Text numberOfLines={1} style={{ fontSize: 15, color: 'rgba(255,255,255,0.65)', marginTop: 6 }}>{subtitle}</Text>}
            {!!note && <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 10, textAlign: 'center' }}>{note}</Text>}
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}
