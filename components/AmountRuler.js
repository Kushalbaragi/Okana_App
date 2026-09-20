import { memo, useCallback, useEffect, useRef } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedScrollHandler, runOnJS } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Stop, Path, Rect, Text as SvgText } from 'react-native-svg';
import { hapticTick } from '../utils/haptics';

// A ruler you drag sideways to set an amount: the ticks scroll under a fixed
// centre line and the value is whichever one sits under it.
//
// The scrolling is a plain horizontal ScrollView with `snapToInterval`, NOT a
// hand-rolled pan gesture with its own inertia. The platform's own momentum and
// rubber-banding are exactly what make a picker feel like a physical dial, and
// they run natively; a JS approximation of them is both more code and worse.
// Reanimated's scroll handler then reads the offset on the UI thread, so the
// only JS work per tick is updating one number and firing a haptic.

const SPACING = 9;
// Breathing room at both ends so the first and last labels aren't half-clipped
// by the SVG's own bounds.
const PAD = 24;
const HEIGHT = 62;
const TICK_TOP = 8;
const MINOR_H = 14;
const MAJOR_H = 26;
// Every tenth tick is taller and carries a label.
const MAJOR_EVERY = 10;
const LABEL_Y = 48;
const FADE_W = 44;

// The step between ticks grows with the amount. A flat step can't serve both
// ends: fine enough for a ₹20,000 goal means thousands of ticks to reach ₹20
// lakh. Widening it keeps small goals precise and big ones a few swipes away.
const BANDS = [
  { upTo: 100000, step: 1000 },
  { upTo: 1000000, step: 10000 },
  { upTo: 5000000, step: 50000 },
];

function buildTicks() {
  const values = [0];
  let prev = 0;
  for (const band of BANDS) {
    for (let v = prev + band.step; v <= band.upTo; v += band.step) values.push(v);
    prev = band.upTo;
  }
  return values;
}

const TICKS = buildTicks();
const N = TICKS.length;
const TRACK_W = (N - 1) * SPACING + PAD * 2;

export const MIN_TARGET = TICKS[1];
export const MAX_TARGET = TICKS[N - 1];

// Nearest tick to a value — an amount typed before this picker existed (or one
// carried over from an older goal) won't sit exactly on one.
export function nearestTickIndex(value) {
  if (!(value > 0)) return 0;
  let lo = 0, hi = N - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (TICKS[mid] < value) lo = mid + 1; else hi = mid;
  }
  if (lo > 0 && value - TICKS[lo - 1] < TICKS[lo] - value) return lo - 1;
  return lo;
}

// "₹5K", "₹1.5L", "₹1Cr" — short enough to sit under a tick without crowding
// its neighbours.
function shortLabel(v) {
  if (v === 0) return '0';
  if (v >= 10000000) return `₹${+(v / 10000000).toFixed(1)}Cr`;
  if (v >= 100000) return `₹${+(v / 100000).toFixed(1)}L`;
  return `₹${Math.round(v / 1000)}K`;
}

// Every tick as two path strings (one for the short ones, one for the tall) so
// the whole ruler is two native nodes instead of a few hundred. Built once, at
// module load: the ruler is the same at every size and in every theme.
const { minorPath, majorPath, labels } = (() => {
  let minor = '';
  let major = '';
  const marks = [];
  for (let i = 0; i < N; i++) {
    const x = PAD + i * SPACING;
    if (i % MAJOR_EVERY === 0) {
      major += `M${x} ${TICK_TOP}V${TICK_TOP + MAJOR_H}`;
      marks.push({ x, text: shortLabel(TICKS[i]) });
    } else {
      minor += `M${x} ${TICK_TOP}V${TICK_TOP + MINOR_H}`;
    }
  }
  return { minorPath: minor, majorPath: major, labels: marks };
})();

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
function AmountRuler({ initialValue, sessionKey, onChange, light = false, surface }) {
  const { width } = useWindowDimensions();
  const scrollRef = useRef(null);
  const lastIndex = useSharedValue(nearestTickIndex(initialValue));
  const lastHapticRef = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const report = useCallback((index) => {
    onChangeRef.current(TICKS[index]);
    // A fast fling crosses ticks quicker than a tap can be felt as separate;
    // spacing them out keeps the ruler buzzing rather than mushing.
    const now = Date.now();
    if (now - lastHapticRef.current > 24) {
      lastHapticRef.current = now;
      hapticTick();
    }
  }, []);

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
      const raw = Math.round(e.contentOffset.x / SPACING);
      const index = raw < 0 ? 0 : raw > N - 1 ? N - 1 : raw;
      if (index !== lastIndex.value) {
        lastIndex.value = index;
        runOnJS(report)(index);
      }
    },
  });

  const tickColor = light ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.20)';
  const majorColor = light ? 'rgba(0,0,0,0.40)' : 'rgba(255,255,255,0.38)';
  const labelColor = light ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)';

  return (
    <View style={{ height: HEIGHT }}>
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={SPACING}
        decelerationRate="fast"
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        // Half the screen of empty space at each end, so the first and last
        // ticks can still reach the centre line.
        contentContainerStyle={{ paddingHorizontal: width / 2 - PAD }}
        contentOffset={{ x: nearestTickIndex(initialValue) * SPACING, y: 0 }}
      >
        <Svg width={TRACK_W} height={HEIGHT}>
          <Path d={minorPath} stroke={tickColor} strokeWidth="1.5" strokeLinecap="round" />
          <Path d={majorPath} stroke={majorColor} strokeWidth="2" strokeLinecap="round" />
          {labels.map(mark => (
            <SvgText key={mark.x} x={mark.x} y={LABEL_Y} fontSize="11" fill={labelColor} textAnchor="middle">
              {mark.text}
            </SvgText>
          ))}
        </Svg>
      </Animated.ScrollView>

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
