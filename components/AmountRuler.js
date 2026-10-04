import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import { ScrollView as GestureScrollView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedScrollHandler, useAnimatedStyle, runOnJS } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Stop, Path, Rect, Text as SvgText } from 'react-native-svg';
import { hapticTick } from '../utils/haptics';
import { textColor } from '../utils/colors';
import { TABULAR, FONT } from '../utils/type';

// A ruler you drag sideways to set an amount: the ticks scroll under a fixed
// centre line and the value is whichever one sits under it.
//
// The scrolling is a plain horizontal ScrollView with `snapToInterval`, NOT a
// hand-rolled pan gesture with its own inertia. The platform's own momentum and
// rubber-banding are exactly what make a picker feel like a physical dial, and
// they run natively; a JS approximation of them is both more code and worse.
// Reanimated's scroll handler then reads the offset on the UI thread, so the
// only JS work per tick is updating one number and firing a haptic.

// gesture-handler's own ScrollView, not react-native's — this is what
// actually made the ruler draggable inside a sheet, and it is worth being
// precise about why. A sheet (InlineSheet) arbitrates its swipe-to-dismiss
// against horizontal gestures inside it with `failOffsetX`, which only
// works between handlers that share gesture-handler's arena: react-native's
// own ScrollView is invisible to that arena, so while the sheet's pan sat
// there deciding whether the sideways movement was big enough to fail on,
// it held the touch and the native scroll never started at all — the ruler
// read as completely dead to the touch. gesture-handler's ScrollView is the
// same component wrapped in a native handler, so it negotiates with the
// sheet's pan properly and wins a horizontal drag outright. BudgetSetupModal's
// copy of this ruler worked only because that sheet's pan has no
// `failOffsetX` to evaluate in the first place.
const SPACING = 9;
// Breathing room at both ends so the first and last labels aren't half-clipped
// by the SVG's own bounds.
const PAD = 24;
const HEIGHT = 62;
const TICK_TOP = 8;
const MINOR_H = 14;
const MAJOR_H = 26;
const LABEL_Y = 48;
const FADE_W = 44;

// The same green the centre line is drawn in, so a completed tick reads as
// "this one is behind the line" rather than as its own separate colour.
// Strong enough to actually register as green over the grey tick it covers,
// not so strong that half the ruler turns into a solid block.
const DONE_TICK = 'rgba(74,222,128,0.70)';
const DONE_MAJOR = 'rgba(74,222,128,0.90)';

// The step between ticks grows with the amount. A flat step can't serve both
// ends: fine enough for a ₹20,000 goal means thousands of ticks to reach ₹20
// lakh. Widening it keeps small goals precise and big ones a few swipes away.
// One shared set of bands now — every ruler in the app (Budget Plan, budget
// setup, savings, debt) feels identical: ₹100 steps up to ₹1 lakh, ₹1,000
// steps up to ₹10 lakh, ₹10,000 beyond that.
//
// `labelEvery` is separate from `step`: it's a rupee amount, not a tick
// count, so a dense band (₹100 ticks) doesn't also mean a dense row of
// labels. A fixed "every 10th tick" rule used to tie the two together —
// harmless at ~150 ticks total, but at the ~2,300 ticks a flat ₹100 step to
// ₹1 lakh needs, that was ~230 SvgText nodes (react-native-svg text is far
// more expensive to lay out than a Path segment) and was the actual cause
// of the sheet hanging on open. Ticks (Path, cheap) can stay dense; labels
// (SvgText, not cheap) are picked by rupee spacing instead, ~45 total here.
const AMOUNT_BANDS = [
  { upTo: 100000, step: 100, labelEvery: 5000 },
  { upTo: 1000000, step: 1000, labelEvery: 50000 },
  { upTo: 5000000, step: 10000, labelEvery: 500000 },
];

// "5K", "1.5L", "1Cr" — short enough to sit under a tick without crowding
// its neighbours.
function shortLabel(v) {
  if (v === 0) return '0';
  if (v >= 10000000) return `${+(v / 10000000).toFixed(1)}Cr`;
  if (v >= 100000) return `${+(v / 100000).toFixed(1)}L`;
  return `${Math.round(v / 1000)}K`;
}

// Everything that depends only on the bands, built once at module load: the
// tick values, and every tick as two path strings (one for the short ones, one
// for the tall) so the whole ruler is two native nodes instead of a few
// hundred. The ruler is otherwise the same at every size and in every theme.
function createScale(bands) {
  const ticks = [0];
  // Every tick, tagged with which band produced it — needed below to know
  // that tick's own `labelEvery`, since bands can differ once ticks are
  // flattened into one array.
  const tickBand = [bands[0]];
  let prev = 0;
  for (const band of bands) {
    for (let v = prev + band.step; v <= band.upTo; v += band.step) { ticks.push(v); tickBand.push(band); }
    prev = band.upTo;
  }
  const count = ticks.length;

  let minor = '';
  let major = '';
  const labels = [];
  for (let i = 0; i < count; i++) {
    const x = PAD + i * SPACING;
    if (ticks[i] % tickBand[i].labelEvery === 0) {
      major += `M${x} ${TICK_TOP}V${TICK_TOP + MAJOR_H}`;
      labels.push({ x, text: shortLabel(ticks[i]) });
    } else {
      minor += `M${x} ${TICK_TOP}V${TICK_TOP + MINOR_H}`;
    }
  }

  // Nearest tick to a value — an amount typed before this picker existed (or
  // one carried over from an older goal or budget) won't sit exactly on one.
  function nearestTickIndex(value) {
    if (!(value > 0)) return 0;
    let lo = 0, hi = count - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ticks[mid] < value) lo = mid + 1; else hi = mid;
    }
    if (lo > 0 && value - ticks[lo - 1] < ticks[lo] - value) return lo - 1;
    return lo;
  }

  return {
    ticks,
    count,
    trackWidth: (count - 1) * SPACING + PAD * 2,
    minorPath: minor,
    majorPath: major,
    labels,
    nearestTickIndex,
  };
}

const AnimatedScrollView = Animated.createAnimatedComponent(GestureScrollView);

// One shared currency scale. `BUDGET_SCALE` is the name its one outside
// caller imports it by; everything in here uses it as the default `scale`.
const AMOUNT_SCALE = createScale(AMOUNT_BANDS);
export const BUDGET_SCALE = AMOUNT_SCALE;

// One edge of the ruler dissolving into the sheet, so ticks arrive and leave
// rather than being cut off at a hard border.
function EdgeFade({ side, color }) {
  const id = `ruler-fade-${side}`;
  return (
    <Svg
      width={FADE_W}
      height={HEIGHT}
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, [side]: 0 }}
    >
      <Defs>
        <LinearGradient id={id} x1={side === 'left' ? '0' : '1'} y1="0" x2={side === 'left' ? '1' : '0'} y2="0">
          <Stop offset="0" stopColor={color} stopOpacity="1" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect width={FADE_W} height={HEIGHT} fill={`url(#${id})`} />
    </Svg>
  );
}

// `sessionKey` changing means "start again from initialValue" — the sheet
// reopening, say. The scroll position is the source of truth the rest of the
// time, so the value is reported out rather than pushed in.
function AmountRuler({ initialValue, sessionKey, onChange, light = false, surface, scale = AMOUNT_SCALE, tintCompleted = false, decelerationRate = 'normal' }) {
  const { width } = useWindowDimensions();
  // The ruler's OWN width, measured — not the window's.
  //
  // Which tick sits under the centre line is pure arithmetic: the content is
  // padded by half the viewport at each end, so tick i lands under the line
  // at exactly `i * SPACING` of scroll — but only if the half-viewport used
  // for that padding is the same box the line is drawn at 50% of. This used
  // to assume the two were the same thing, which held while every ruler bled
  // to the screen edges (BudgetSetupModal's still does). The month rulers in
  // the debt sheet deliberately don't any more — they sit inside that
  // sheet's own 20px gutters — so the padding was overshooting by 20px and
  // the value read off the scroll was a little over two ticks away from the
  // tick actually under the line. Measuring makes it exact either way.
  const [viewportW, setViewportW] = useState(width);
  const onViewportLayout = useCallback((e) => {
    const w = e.nativeEvent.layout.width;
    // Sub-pixel layout noise would otherwise re-render on every pass.
    setViewportW(prev => (Math.abs(prev - w) < 0.5 ? prev : w));
  }, []);
  // Pulled out as plain values: the scroll handler below is a worklet, and
  // capturing the whole scale would copy every tick across to the UI thread.
  const { ticks, count, trackWidth, minorPath, majorPath, labels, nearestTickIndex } = scale;
  const scrollRef = useRef(null);
  // Captured once, at mount, and never handed a new object again.
  //
  // `contentOffset` is a NATIVE prop: React Native pushes it back down into
  // the scroll view every time it changes, mid-gesture included. And
  // `initialValue` is the live value this ruler is itself driving (the
  // sheet's own state, set from `onChange` below), so building this inline
  // meant every tick crossed during a drag shoved a fresh offset into a
  // scroll that was still moving — and a stale one at that, since it had
  // been round-tripping through `runOnJS` → setState → re-render while the
  // finger kept going. That fight is what read as the ruler jumping back to
  // where it started, and as a fling that alternately raced and stalled.
  //
  // Repositioning after mount is `sessionKey`'s job alone, through the
  // imperative scrollTo below — safe precisely because it only fires when
  // the sheet says to start over, never while a drag is in flight.
  const initialOffset = useRef({ x: nearestTickIndex(initialValue) * SPACING, y: 0 }).current;
  const lastIndex = useSharedValue(nearestTickIndex(initialValue));
  // Only read by the `tintCompleted` overlay below, and only on the UI
  // thread — the tint has to follow the finger frame for frame, so it can't
  // go through the JS-side value `onChange` reports.
  const scrollX = useSharedValue(nearestTickIndex(initialValue) * SPACING);
  const lastHapticRef = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const report = useCallback((index) => {
    onChangeRef.current(ticks[index]);
    // A fast fling crosses ticks quicker than a tap can be felt as separate;
    // spacing them out keeps the ruler buzzing rather than mushing.
    const now = Date.now();
    if (now - lastHapticRef.current > 24) {
      lastHapticRef.current = now;
      hapticTick();
    }
  }, [ticks]);

  useEffect(() => {
    const index = nearestTickIndex(initialValue);
    // Set this BEFORE scrolling: the scroll handler only reports a change, so
    // agreeing with it up front keeps the jump silent — no haptic, and no
    // overwriting an exact value that doesn't sit on a tick.
    lastIndex.value = index;
    scrollRef.current?.scrollTo({ x: index * SPACING, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.value = e.contentOffset.x;
      const raw = Math.round(e.contentOffset.x / SPACING);
      const index = raw < 0 ? 0 : raw > count - 1 ? count - 1 : raw;
      if (index !== lastIndex.value) {
        lastIndex.value = index;
        runOnJS(report)(index);
      }
    },
  });

  // The "already done" tint: a green copy of the same ticks, laid exactly
  // over the grey ones and clipped to the half of the ruler left of the
  // centre line — so every tick that has passed under the line reads as
  // completed and the ones still to come stay grey.
  //
  // Clipping at the centre rather than at the selected tick's own position
  // is what makes this cost nothing per frame: "left of centre" IS "lower
  // than the current value", so there's no width to recompute as the value
  // changes. The only thing that moves is this copy's own offset, which
  // tracks the scroll on the UI thread, so the colour boundary stays glued
  // to the line through a slow drag and a fast fling alike.
  const tintStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: viewportW / 2 - PAD - scrollX.value }],
  }));

  const tickColor = light ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.20)';
  const majorColor = light ? 'rgba(0,0,0,0.40)' : 'rgba(255,255,255,0.38)';
  const labelColor = textColor(light).disabled;

  return (
    <View style={{ height: HEIGHT }} onLayout={onViewportLayout}>
      <AnimatedScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={SPACING}
        decelerationRate={decelerationRate}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        // Half the ruler of empty space at each end, so the first and last
        // ticks can still reach the centre line.
        contentContainerStyle={{ paddingHorizontal: viewportW / 2 - PAD }}
        contentOffset={initialOffset}
      >
        <Svg width={trackWidth} height={HEIGHT}>
          <Path d={minorPath} stroke={tickColor} strokeWidth="1.5" strokeLinecap="round" />
          <Path d={majorPath} stroke={majorColor} strokeWidth="2" strokeLinecap="round" />
          {labels.map(mark => (
            <SvgText key={mark.x} x={mark.x} y={LABEL_Y} fontSize="11" fill={labelColor} textAnchor="middle">
              {mark.text}
            </SvgText>
          ))}
        </Svg>
      </AnimatedScrollView>

      {tintCompleted && (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: '50%', height: HEIGHT, overflow: 'hidden' }}>
          <Animated.View style={tintStyle}>
            <Svg width={trackWidth} height={HEIGHT}>
              <Path d={minorPath} stroke={DONE_TICK} strokeWidth="1.5" strokeLinecap="round" />
              <Path d={majorPath} stroke={DONE_MAJOR} strokeWidth="2" strokeLinecap="round" />
            </Svg>
          </Animated.View>
        </View>
      )}

      <EdgeFade side="left" color={surface} />
      <EdgeFade side="right" color={surface} />

      {/* The selection itself: whatever sits under this line is the value. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute', left: '50%', marginLeft: -1.25, top: 2,
          width: 2.5, height: MAJOR_H + 8, borderRadius: 2, backgroundColor: '#4ade80',
        }}
      />
    </View>
  );
}

export default memo(AmountRuler);

const MONTHS_MIN = 0;
const MONTHS_MAX = 300;

// A plain 1-tick-per-month scale for a duration ruler (EMI tenure, and EMIs
// already paid, in GoalSheet) — shaped exactly like `createScale`'s own
// output above, so it drops straight into `AmountRuler`'s `scale` prop and
// gets its drag, haptic-per-tick and edge-fade behaviour for free. A major
// tick, labelled with its own month count, every 12 months — same "dense
// ticks, sparser labels" split `createScale` uses, just on a flat 1-month
// step instead of widening bands (300 ticks, at most, is cheap enough on
// its own to need no banding). Labelled in months rather than years
// throughout: the number being picked IS a count of EMIs, and showing the
// axis in years meant reading a year off the ruler and a month count off
// the figure above it.
//
// Takes its own top end rather than always running to MONTHS_MAX — EMIs
// already paid is built on this with `max` set to whatever the tenure
// ruler currently holds, so there's no tick past "every EMI this loan
// actually has" to drag onto and no way to claim more paid than the loan
// is long. GoalSheet rebuilds this (via `monthsScale` below) whenever the
// tenure changes; everything past that point in the string-building loop
// is just never generated, not generated-then-hidden.
function buildMonthsScale(max) {
  const count = max - MONTHS_MIN + 1;
  let minor = '';
  let major = '';
  const labels = [];
  for (let i = 0; i < count; i++) {
    const x = PAD + i * SPACING;
    const months = MONTHS_MIN + i;
    if (months % 12 === 0) {
      major += `M${x} ${TICK_TOP}V${TICK_TOP + MAJOR_H}`;
      labels.push({ x, text: `${months}` });
    } else {
      minor += `M${x} ${TICK_TOP}V${TICK_TOP + MINOR_H}`;
    }
  }
  function nearestTickIndex(value) {
    const clamped = Math.max(MONTHS_MIN, Math.min(max, Math.round(value) || MONTHS_MIN));
    return clamped - MONTHS_MIN;
  }
  return {
    count,
    trackWidth: (count - 1) * SPACING + PAD * 2,
    minorPath: minor,
    majorPath: major,
    labels,
    nearestTickIndex,
  };
}

// `max` defaults to the full MONTHS_MAX range (Total EMIs' own usage);
// EMIs already paid passes the current tenure instead (clamped into range,
// and never below MONTHS_MIN) so its own ruler only ever offers ticks the
// loan actually has.
export function monthsScale(max = MONTHS_MAX) {
  // `max` of 0 is a real answer (a loan with no EMIs set yet has nothing to have paid), not "unset".
  const clampedMax = Math.max(MONTHS_MIN, Math.min(MONTHS_MAX, Number.isFinite(max) ? Math.round(max) : MONTHS_MAX));
  return { ticks: Array.from({ length: clampedMax - MONTHS_MIN + 1 }, (_, i) => MONTHS_MIN + i), ...buildMonthsScale(clampedMax) };
}

const figureFormat = new Intl.NumberFormat('en-IN');

// The readout that goes above the ruler: the amount it is currently on, big,
// with a dimmed rupee sign.
export function RulerFigure({ value, light = false }) {
  return (
    <Text
      style={{ fontSize: FONT.display, lineHeight: 50, fontWeight: '300', letterSpacing: -1, color: light ? '#111111' : '#ffffff', ...TABULAR }}
    >
      <Text style={{ fontSize: FONT.amount, fontWeight: '400', color: textColor(light).disabled }}>₹ </Text>
      {figureFormat.format(value)}
    </Text>
  );
}
