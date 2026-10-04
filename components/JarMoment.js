import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, runOnJS, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue, withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { POSITIVE, money } from './savingsShared';
import RollingNumber from './RollingNumber';
import { hapticAdded, hapticTick } from '../utils/haptics';
import { seg, soft } from '../utils/timeline';
import { TABULAR, FONT } from '../utils/type';
import { EXPENSE_HEX } from '../utils/colors';

// The savings moment: a glass jar of coins that is the goal. Each coin is worth
// a 24th of the target, so the pile always says how far along the goal is. A
// deposit drops coins into it; a withdrawal lifts them out. Like PaidMoment,
// one linear clock drives everything and each element reads its own slice.
const SLOTS = 24;
const PER_ROW = 3;
// The jar is drawn in a 200 x 190 box and scaled up to read on a phone.
const BOX_W = 200;
const BOX_H = 190;
const SCALE = 1.25;
const COIN_W = 22;
const COIN_H = 12;

const GOLD = '#e0b84a';
const GOLD_EDGE = '#a8872f';

// Where coin number `i` sits in the pile (its centre), bottom row first.
const slotPos = (i) => {
  const row = Math.floor(i / PER_ROW);
  const col = i % PER_ROW;
  return { x: 100 + (col - 1) * 24 + (row % 2 === 0 ? -2 : 2), y: 160 - row * 10 };
};

// One coin: a darker rim under a lighter face, as two flat ellipses.
function CoinFace() {
  return (
    <>
      <View style={{ position: 'absolute', left: 0, top: 3, width: COIN_W, height: COIN_H - 3, borderRadius: COIN_W / 2, backgroundColor: GOLD_EDGE }} />
      <View style={{ position: 'absolute', left: 0, top: 0, width: COIN_W, height: COIN_H - 3, borderRadius: COIN_W / 2, backgroundColor: GOLD, borderWidth: 1, borderColor: GOLD_EDGE }} />
    </>
  );
}

// A coin in the pile. `at` is the moment its visibility flips: it appears then
// (a deposit's coin, once it has landed) or disappears then (a withdrawn coin,
// as it lifts out). With no `at` it is simply there.
function PileCoin({ slot, ms, at, appear }) {
  const { x, y } = slotPos(slot);
  const style = useAnimatedStyle(() => {
    if (at == null) return { opacity: 1 };
    const past = ms.value >= at;
    return { opacity: appear ? (past ? 1 : 0) : (past ? 0 : 1) };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left: x - COIN_W / 2, top: y - COIN_H / 2, width: COIN_W, height: COIN_H }, style]}>
      <CoinFace />
    </Animated.View>
  );
}

// A deposited coin in flight: falls from above the jar (spinning edge-on,
// tilting a little), lands on its slot, bounces twice, then hands over to the
// pile's own coin. `absorbed` is a coin that doesn't add a whole slot to the
// pile (the deposit was under one coin's worth): it fades out where it lands.
function FallingCoin({ slot, ms, start, move, settle, absorbed }) {
  const target = slot >= 0 ? slotPos(slot) : slotPos(0);
  const land = start + move;
  const style = useAnimatedStyle(() => {
    const t = ms.value;
    if (t < start) return { opacity: 0 };
    const p = Math.min(1, (t - start) / move);
    const fall = p * p;
    let bounce = 0;
    const u = t - land;
    const first = settle * 0.55;
    if (u > 0 && u < first) bounce = -9 * Math.sin((Math.PI * u) / first);
    else if (u >= first && u < settle) bounce = -3.5 * Math.sin((Math.PI * (u - first)) / (settle - first));
    const flip = p < 1 ? Math.abs(Math.cos(p * 13)) * 0.85 + 0.15 : 1;
    const tilt = p < 1 ? Math.sin(p * 9) * 14 : 0;
    let opacity = 1;
    if (absorbed) opacity = 1 - Math.min(1, Math.max(0, (t - (land + settle)) / 700));
    else if (t >= land + settle) opacity = 0;
    return {
      opacity,
      transform: [
        { translateX: (100 - target.x) * (1 - p) },
        { translateY: -(target.y - 12) * (1 - fall) + bounce },
        { scaleX: flip },
        { rotate: `${tilt}deg` },
      ],
    };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left: target.x - COIN_W / 2, top: target.y - COIN_H / 2, width: COIN_W, height: COIN_H }, style]}>
      <CoinFace />
    </Animated.View>
  );
}

// A withdrawn coin: lifts off its slot, arcs up and out of the jar to the side,
// turning slightly, and fades.
function LeavingCoin({ slot, ms, start, move }) {
  const from = slotPos(slot);
  const style = useAnimatedStyle(() => {
    const t = ms.value;
    if (t < start) return { opacity: 0 };
    const p = Math.min(1, (t - start) / move);
    const e = 1 - (1 - p) * (1 - p) * (1 - p);
    return {
      opacity: 1 - Math.min(1, Math.max(0, (p - 0.5) / 0.5)),
      transform: [
        { translateX: (150 - from.x) * e },
        { translateY: -(from.y + 30) * e },
        { rotate: `${22 * p}deg` },
      ],
    };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left: from.x - COIN_W / 2, top: from.y - COIN_H / 2, width: COIN_W, height: COIN_H }, style]}>
      <CoinFace />
    </Animated.View>
  );
}

// Completing a goal throws a burst of confetti out from behind the jar, the
// same physics as the celebration it replaces: thrown out, sideways speed
// bleeding off, then a free fall. Deterministic, so every burst is the same.
const PIECES = 28;
const GRAVITY = 1100;
const DRAG = 2.2;
const SLOWDOWN = 1.4;
const BURST_MS = 2600 * SLOWDOWN;
const CONFETTI = ['#4ade80', '#facc15', '#f472b6', '#60a5fa', '#fb923c', '#a78bfa', '#f87171', '#2dd4bf', 'rgba(255,255,255,0.9)'];
const spread = (i, salt) => {
  const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const PIECE_SPECS = Array.from({ length: PIECES }, (_, i) => {
  const angle = spread(i, 1) * Math.PI * 2;
  const speed = 160 + spread(i, 2) * 170;
  return {
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed - 80,
    size: 4 + spread(i, 3) * 4,
    color: CONFETTI[i % CONFETTI.length],
    round: i % 3 !== 0,
    spin: (spread(i, 4) - 0.5) * 720,
  };
});

function ConfettiPiece({ ms, at, vx, vy, size, color, round, spin }) {
  const style = useAnimatedStyle(() => {
    const since = ms.value - at;
    if (since <= 0) return { opacity: 0 };
    const tau = Math.min(since, BURST_MS) / 1000 / SLOWDOWN;
    return {
      opacity: 1,
      transform: [
        { translateX: (vx / DRAG) * (1 - Math.exp(-DRAG * tau)) },
        { translateY: vy * tau + 0.5 * GRAVITY * tau * tau },
        { rotate: `${spin * tau}deg` },
      ],
    };
  });
  return (
    <Animated.View
      style={[{ position: 'absolute', width: size, height: round ? size : size * 0.5, borderRadius: round ? size / 2 : 2, backgroundColor: color }, style]}
    />
  );
}

// What the pile does for this transaction, worked out from the goal's own
// numbers: how many coins it held, how many it holds now, which of those move.
function plan(type, savedBefore, savedAfter, target, complete) {
  const value = target / SLOTS;
  const count = (s) => Math.max(0, Math.min(SLOTS, Math.floor(s / value + 1e-6)));
  const before = count(savedBefore);
  // Completing the goal always ends on a full jar, whatever rounding says.
  const after = complete ? SLOTS : count(savedAfter);
  // Every coin that is added or taken out is shown moving, one after another —
  // the jar only ever starts with the pile that was already there.
  if (type === 'add') {
    const diff = after - before;
    if (diff > 0) return { shown: before, slots: Array.from({ length: diff }, (_, i) => before + i), absorbed: false };
    return { shown: before, slots: [-1], absorbed: true };
  }
  const diff = Math.max(0, before - after);
  return { shown: before, slots: Array.from({ length: diff }, (_, i) => before - 1 - i), absorbed: false };
}

export default function JarMoment({ type, name, savedBefore, savedAfter, target, amount, complete = false, light = false, onRelease, onDone }) {
  const isAdd = type === 'add';
  const { shown, slots, absorbed } = useMemo(() => plan(type, savedBefore, savedAfter, target, complete), [type, savedBefore, savedAfter, target, complete]);

  // The timeline, in ms. The jar comes in quickly; coins start once it has settled in; the number
  // rolls once the last one is down; the text goes first, then the dark wash.
  const FIRST = 600;
  // Few coins fall slowly; a big deposit (a whole goal at once) tightens the gap
  // so the jar still fills in about five seconds, every coin seen.
  const count = Math.max(1, slots.length);
  const GAP = Math.max(170, Math.min(isAdd ? 800 : 600, 5000 / count));
  const MOVE = isAdd ? 1100 : 1000;
  const SETTLE = isAdd ? 600 : 0;
  const lastEnd = slots.length > 0 ? FIRST + (slots.length - 1) * GAP + MOVE + SETTLE : 1000;
  const T = useMemo(() => ({
    // Completing the goal holds a little longer: the jar glows, then the check.
    total: lastEnd + (complete ? 7000 : 5800),
    scrimIn: [0, 300],
    jarIn: [30, 520],
    roll: [lastEnd + 300, lastEnd + 1300],
    float: [lastEnd - 600, lastEnd + 1200],
    glow: [lastEnd + 100, lastEnd + 1400],
    done: [lastEnd + 1500, lastEnd + 2100],
    contentOut: complete ? [lastEnd + 5000, lastEnd + 5700] : [lastEnd + 3800, lastEnd + 4500],
    scrimOut: complete ? [lastEnd + 5700, lastEnd + 7000] : [lastEnd + 4500, lastEnd + 5800],
    firstLand: FIRST + MOVE,
  }), [lastEnd, MOVE, complete]);

  const t = useSharedValue(0);
  const skip = useSharedValue(0);
  const ms = useDerivedValue(() => t.value * T.total);

  const doneRef = useRef(false);
  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }, [onDone]);

  useEffect(() => {
    t.value = withTiming(1, { duration: T.total, easing: Easing.linear }, (done) => { if (done) runOnJS(finish)(); });
    AccessibilityInfo.announceForAccessibility(complete ? `${name || 'Goal'} completed. ${money(savedAfter)} saved.` : `${money(savedAfter)} saved of ${money(target)}.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finishEarly = () => {
    onRelease?.();
    skip.value = withTiming(1, { duration: 600, easing: Easing.inOut(Easing.quad) }, (done) => { if (done) runOnJS(finish)(); });
  };

  // A deposit's thud lands with the first coin; a withdrawal gets a light tick
  // as the first one lifts.
  useAnimatedReaction(
    () => ms.value >= (isAdd ? T.firstLand : FIRST),
    (past, was) => { if (past && !was && slots.length > 0) runOnJS(isAdd ? hapticAdded : hapticTick)(); },
  );

  // Completing the goal gets its own success haptic as the check appears.
  useAnimatedReaction(
    () => complete && ms.value >= T.done[0],
    (past, was) => { if (past && !was) runOnJS(hapticAdded)(); },
  );

  // The page underneath updates as the dark wash starts to leave, so it is
  // already showing the new figures while it fades off.
  useAnimatedReaction(
    () => ms.value >= T.scrimOut[0],
    (past, was) => { if (past && !was && onRelease) runOnJS(onRelease)(); },
  );

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: seg(ms.value, T.scrimIn) * (1 - soft(ms.value, T.scrimOut)) * (1 - skip.value),
  }));
  // The jar slides up a little as it fades in.
  const contentStyle = useAnimatedStyle(() => {
    const arrive = seg(ms.value, T.jarIn);
    return {
      opacity: arrive * (1 - soft(ms.value, T.contentOut)) * (1 - skip.value),
      transform: [{ translateY: (1 - arrive) * 28 }],
    };
  });
  // The whole jar gives a small shake when the first coin lands.
  const jarStyle = useAnimatedStyle(() => {
    const u = (ms.value - T.firstLand) / 1000;
    const shake = isAdd && u > 0 && u < 0.6 ? Math.sin(u * 45) * 1.6 * (1 - u / 0.6) : 0;
    return { transform: [{ translateY: shake }] };
  });
  const floatStyle = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, (ms.value - T.float[0]) / (T.float[1] - T.float[0])));
    return { opacity: Math.sin(Math.PI * Math.min(1, p * 1.15)), transform: [{ translateY: -22 * p }] };
  });

  // A full jar's outline turns green, then the completion line fades in.
  const glowStyle = useAnimatedStyle(() => ({ opacity: complete ? seg(ms.value, T.glow) : 0 }));
  const doneStyle = useAnimatedStyle(() => ({ opacity: seg(ms.value, T.done) }));

  const ink = light ? '#111111' : '#ffffff';
  const mute = light ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)';
  const scrim = light ? 'rgba(255,255,255,0.97)' : 'rgba(0,0,0,0.97)';
  const amountText = { fontSize: FONT.amount, fontWeight: '300', lineHeight: 36, color: ink, ...TABULAR };

  return (
    <Modal transparent animationType="none" statusBarTranslucent visible onRequestClose={finish}>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: scrim }, scrimStyle]} />
        <Pressable style={StyleSheet.absoluteFill} onPress={finishEarly} accessibilityRole="button" accessibilityLabel="Dismiss" />

        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }, contentStyle]}>
          <View style={{ width: BOX_W * SCALE, height: BOX_H * SCALE }}>
            <View style={{ position: 'absolute', left: 0, top: 0, width: BOX_W, height: BOX_H, transformOrigin: 'top left', transform: [{ scale: SCALE }] }}>
            <Animated.View style={[{ width: BOX_W, height: BOX_H }, jarStyle]}>
              {complete && (
                <View pointerEvents="none" style={{ position: 'absolute', left: BOX_W / 2, top: 100, width: 0, height: 0 }}>
                  {PIECE_SPECS.map((spec, i) => <ConfettiPiece key={i} ms={ms} at={T.glow[0]} {...spec} />)}
                </View>
              )}
              <Svg width={BOX_W} height={BOX_H} viewBox={`0 0 ${BOX_W} ${BOX_H}`} fill="none">
                <Path d="M70 44h60v8l9 12v92q0 12-12 12H73q-12 0-12-12V64l9-12z" fill="#ffffff" fillOpacity={0.04} stroke="#4a4a4a" strokeWidth={1.5} />
                <Path d="M72 68v84" stroke="#ffffff" strokeOpacity={0.12} strokeWidth={3} strokeLinecap="round" />
                <Path d="M130 70v70" stroke="#ffffff" strokeOpacity={0.05} strokeWidth={2} strokeLinecap="round" />
                <Path d="M66 84H134" stroke="#ffffff" strokeOpacity={0.18} strokeWidth={1} strokeDasharray="3 4" />
              </Svg>
              <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0 }, glowStyle]}>
                <Svg width={BOX_W} height={BOX_H} viewBox={`0 0 ${BOX_W} ${BOX_H}`} fill="none">
                  <Path d="M70 44h60v8l9 12v92q0 12-12 12H73q-12 0-12-12V64l9-12z" stroke="#4ade80" strokeOpacity={0.85} strokeWidth={1.8} />
                </Svg>
              </Animated.View>
              {Array.from({ length: shown }, (_, i) => {
                const leaving = !isAdd ? slots.indexOf(i) : -1;
                return <PileCoin key={i} slot={i} ms={ms} at={leaving >= 0 ? FIRST + leaving * GAP : undefined} appear={false} />;
              })}
              {isAdd && !absorbed && slots.map((slot, i) => (
                <PileCoin key={`add-${slot}`} slot={slot} ms={ms} at={FIRST + i * GAP + MOVE + SETTLE} appear />
              ))}
              {slots.map((slot, i) => (isAdd
                ? <FallingCoin key={`f-${i}`} slot={slot} ms={ms} start={FIRST + i * GAP} move={MOVE} settle={SETTLE} absorbed={absorbed} />
                : <LeavingCoin key={`l-${i}`} slot={slot} ms={ms} start={FIRST + i * GAP} move={MOVE} />))}
              <Animated.Text style={[{ position: 'absolute', left: 120, top: 80, width: 60, textAlign: 'center', fontSize: FONT.caption, fontWeight: '500', color: isAdd ? POSITIVE : EXPENSE_HEX }, floatStyle]}>
                {isAdd ? '+' : '−'}{money(amount)}
              </Animated.Text>
            </Animated.View>
            </View>
          </View>

          {!!name && !complete && (
            <Text numberOfLines={1} style={{ fontSize: FONT.body, fontWeight: '400', color: ink, marginTop: 4, paddingHorizontal: 32 }}>{name}</Text>
          )}
          <View style={{ alignItems: 'center', marginTop: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <RollingNumber from={money(savedBefore)} to={money(savedAfter)} ms={ms} range={T.roll} style={amountText} lh={36} />
              <Text style={{ fontSize: FONT.caption, fontWeight: '300', color: mute }}>saved</Text>
            </View>
            {complete && (
              <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingHorizontal: 32 }, doneStyle]}>
                <Svg width={20} height={20} viewBox="0 0 92 92" fill="none">
                  <Circle cx={46} cy={46} r={46} fill="#4ade80" />
                  <Path d="M27 47l13 13 25-27" stroke="#000000" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
                <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: FONT.body, fontWeight: '400', color: POSITIVE }}>
                  {name ? `You saved for ${name}` : 'Goal completed'}
                </Text>
              </Animated.View>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
