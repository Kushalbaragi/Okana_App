import { useCallback, useEffect, useRef } from 'react';
import { AccessibilityInfo, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, runOnJS, useAnimatedProps, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue, withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { POSITIVE, money } from './savingsShared';
import { hapticAdded } from '../utils/haptics';
import { TABULAR } from '../utils/type';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// One linear clock drives the whole thing; every element reads its own slice
// of it. Each beat is quick, with a pause before the next one starts, and only
// one thing is ever on screen: the check, then the amount (rolling down to what
// is left), then the EMI count (rolling down by one). The exit goes in two
// steps: the text fades, then the dark background fades off the page.
const TOTAL_MS = 16560;
const SCRIM_IN = [0, 600];
const RING = [720, 1200];
const TICK = [1140, 1500];
const LABEL_IN = [1320, 1800];
const CHECK_OUT = [3960, 4440];
const AMOUNT_IN = [4440, 4920];
const AMOUNT_ROLL = [6360, 7200];
const AMOUNT_OUT = [9240, 9720];
const COUNT_IN = [9720, 10200];
const COUNT_ROLL = [11640, 12360];
const CONTENT_OUT = [14400, 15120];
const SCRIM_OUT = [15120, 16560];
// The tick lands at the end of TICK — the haptic goes with it.
const HAPTIC_AT = 1500;
// A full circle starting at the top, as a path so it can be drawn with a dash.
const RING_PATH = 'M46 4a42 42 0 1 1 0 84a42 42 0 1 1 0-84';
const RING_LEN = 264;
const TICK_LEN = 56;

const seg = (ms, range) => {
  'worklet';
  const x = Math.min(1, Math.max(0, (ms - range[0]) / (range[1] - range[0])));
  return 1 - (1 - x) * (1 - x) * (1 - x);
};

// The exits use a smoothstep (slow at both ends) instead of the ease-out the
// beats use, so nothing starts or stops with a visible edge.
const soft = (ms, range) => {
  'worklet';
  const x = Math.min(1, Math.max(0, (ms - range[0]) / (range[1] - range[0])));
  return x * x * (3 - 2 * x);
};

// One character position of a rolling number: the old character slides up and
// out while the new one slides in from below, together, inside a box one line
// tall so nothing shows outside it.
function RollChar({ oldCh, newCh, ms, range, style, lh }) {
  const oldStyle = useAnimatedStyle(() => {
    const p = seg(ms.value, range);
    return { opacity: 1 - p, transform: [{ translateY: -lh * p }] };
  });
  const newStyle = useAnimatedStyle(() => {
    const p = seg(ms.value, range);
    return { opacity: p, transform: [{ translateY: lh * (1 - p) }] };
  });
  const place = [style, { position: 'absolute', left: 0, right: 0, textAlign: 'center' }];
  return (
    <View style={{ height: lh, overflow: 'hidden', justifyContent: 'center' }}>
      {/* Invisible, only to give the box its width. */}
      <Text style={[style, { opacity: 0 }]}>{newCh || oldCh}</Text>
      <Animated.Text style={[...place, oldStyle]}>{oldCh}</Animated.Text>
      <Animated.Text style={[...place, newStyle]}>{newCh}</Animated.Text>
    </View>
  );
}

// A number that changes digit by digit: only the characters that differ
// (lined up from the right) roll, the rest — the ₹, the commas, a digit that
// stays the same — sit still. 26 → 25 rolls just the 6.
function RollingNumber({ from, to, ms, range, style, lh }) {
  const a = Array.from(from).reverse();
  const b = Array.from(to).reverse();
  const n = Math.max(a.length, b.length);
  const cells = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const oldCh = a[i] ?? '';
    const newCh = b[i] ?? '';
    cells.push(oldCh === newCh
      ? <Text key={i} style={style}>{oldCh}</Text>
      : <RollChar key={i} oldCh={oldCh} newCh={newCh} ms={ms} range={range} style={style} lh={lh} />);
  }
  return <View style={{ flexDirection: 'row', alignItems: 'center', height: lh }}>{cells}</View>;
}

// The paid moment: not a pop-up, just the page going dark for a few seconds.
// `prevRemaining`/`remaining` are the money owed before and after this EMI,
// `prevLeft`/`left` the EMIs remaining. `onDone` fires once, when it has faded
// or been tapped away. The scrim is a near-opaque dark wash rather than a real blur — the app
// dropped BlurView on purpose (see Glass.js), and this hides the page better.
export default function PaidMoment({ title, milestone, left, prevLeft, remaining, prevRemaining, light = false, onDone }) {
  const t = useSharedValue(0);
  const skip = useSharedValue(0);
  // The whole timeline in milliseconds — every beat below reads its slice.
  const ms = useDerivedValue(() => t.value * TOTAL_MS);

  // Finishing and being tapped away can both land; the parent hears once.
  const doneRef = useRef(false);
  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }, [onDone]);

  useEffect(() => {
    t.value = withTiming(1, { duration: TOTAL_MS, easing: Easing.linear }, (done) => { if (done) runOnJS(finish)(); });
    AccessibilityInfo.announceForAccessibility(`${title}. ${money(remaining)} left to pay. ${left} EMIs to go.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finishEarly = () => {
    skip.value = withTiming(1, { duration: 600, easing: Easing.inOut(Easing.quad) }, (done) => { if (done) runOnJS(finish)(); });
  };

  useAnimatedReaction(
    () => ms.value >= HAPTIC_AT,
    (past, was) => { if (past && !was) runOnJS(hapticAdded)(); },
  );

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: seg(ms.value, SCRIM_IN) * (1 - soft(ms.value, SCRIM_OUT)) * (1 - skip.value),
  }));
  const contentStyle = useAnimatedStyle(() => ({
    opacity: (1 - soft(ms.value, CONTENT_OUT)) * (1 - skip.value),
  }));

  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: RING_LEN * (1 - seg(ms.value, RING)) }));
  const tickProps = useAnimatedProps(() => ({ strokeDashoffset: TICK_LEN * (1 - seg(ms.value, TICK)) }));
  const checkStyle = useAnimatedStyle(() => ({ opacity: 1 - soft(ms.value, CHECK_OUT) }));
  const labelStyle = useAnimatedStyle(() => ({ opacity: seg(ms.value, LABEL_IN) }));

  const amountStyle = useAnimatedStyle(() => ({
    opacity: seg(ms.value, AMOUNT_IN) * (1 - soft(ms.value, AMOUNT_OUT)),
  }));
  const countStyle = useAnimatedStyle(() => ({ opacity: seg(ms.value, COUNT_IN) }));
  const ink = light ? '#111111' : '#ffffff';
  const mute = light ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)';
  const scrim = light ? 'rgba(255,255,255,0.97)' : 'rgba(0,0,0,0.97)';
  const numText = { fontSize: 40, fontWeight: '300', lineHeight: 48, color: ink, ...TABULAR };
  const amtText = { fontSize: 26, fontWeight: '300', letterSpacing: -0.5, lineHeight: 34, color: ink, ...TABULAR };
  const centred = { position: 'absolute', alignItems: 'center' };

  // A transparent Modal, like Celebration's: it covers the whole device, so
  // the text sits at the true centre of the screen.
  return (
    <Modal transparent animationType="none" statusBarTranslucent visible onRequestClose={finish}>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: scrim }, scrimStyle]} />
        <Pressable style={StyleSheet.absoluteFill} onPress={finishEarly} accessibilityRole="button" accessibilityLabel="Dismiss" />

        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }, contentStyle]}>
          <Animated.View style={[centred, checkStyle]}>
            <Svg width={44} height={44} viewBox="0 0 92 92" fill="none">
              <AnimatedPath d={RING_PATH} stroke={POSITIVE} strokeWidth={3} strokeLinecap="round" strokeDasharray={RING_LEN} animatedProps={ringProps} />
              <AnimatedPath d="M28 47l12 12 24-26" stroke={POSITIVE} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={TICK_LEN} animatedProps={tickProps} />
            </Svg>
            <Animated.Text style={[{ fontSize: 14, fontWeight: '300', marginTop: 14, color: ink }, labelStyle]}>{title}</Animated.Text>
          </Animated.View>

          <Animated.View style={[centred, amountStyle]}>
            <RollingNumber from={money(prevRemaining)} to={money(remaining)} ms={ms} range={AMOUNT_ROLL} style={amtText} lh={34} />
            <Text style={{ fontSize: 12, fontWeight: '300', color: mute, marginTop: 6 }}>left to pay</Text>
          </Animated.View>

          <Animated.View style={[centred, countStyle]}>
            {!!milestone && <Text style={{ fontSize: 13, fontWeight: '300', color: POSITIVE, marginBottom: 8 }}>{milestone}</Text>}
            <RollingNumber from={String(prevLeft)} to={String(left)} ms={ms} range={COUNT_ROLL} style={numText} lh={48} />
            <Text style={{ fontSize: 12, fontWeight: '300', color: mute, marginTop: 6 }}>EMIs to go</Text>
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}
