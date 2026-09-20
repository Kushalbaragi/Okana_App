import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, View, Text, Pressable } from 'react-native';
import Animated, { runOnJS, useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { hapticTick } from '../utils/haptics';
import { reportError } from '../utils/errors';
import { POSITIVE, dim, money } from './savingsShared';

// Width each month takes along the slider, and the bar drawn inside it.
const STEP = 28;
const BAR_W = 10;
const CHART_H = 80;
const DOT = 5;

const GREEN = { active: 'rgba(74,222,128,0.95)', dim: 'rgba(74,222,128,0.5)' };
const RED = { active: 'rgba(255,75,75,0.92)', dim: 'rgba(255,75,75,0.45)' };
const RED_TEXT = 'rgba(255,75,75,0.92)';

// The drift: how long after opening it starts (the page is still fading in),
// how long the row is left out at the side, and when it counts as finished.
const NUDGE_START_MS = 800;
const NUDGE_BACK_MS = 1400;
const NUDGE_END_MS = 2000;

// One month's bar, or a dot when nothing moved. Memoised so a change of
// selection repaints only the two months it touches.
const MonthBar = memo(function MonthBar({ index, net, max, on, light, onPick }) {
  const tone = net < 0 ? RED : GREEN;
  const h = net === 0 ? 0 : Math.max(4, Math.round((Math.abs(net) / max) * CHART_H));
  return (
    <Pressable onPress={() => onPick(index)} style={{ width: STEP, height: CHART_H, alignItems: 'center', justifyContent: 'flex-end' }}>
      {h > 0 ? (
        <View style={{ width: BAR_W, height: h, borderRadius: BAR_W / 2, backgroundColor: on ? tone.active : tone.dim }} />
      ) : (
        <View style={{ width: DOT, height: DOT, borderRadius: DOT / 2, marginBottom: (BAR_W - DOT) / 2, backgroundColor: dim(light, on ? 0.6 : 0.2) }} />
      )}
    </Pressable>
  );
});

// A row of monthly bars that slides under a fixed centre: the bar in the middle
// is the selected one, drawn at full strength with its figure above and its
// month below, and the row snaps a bar at a time as it's dragged. A tap on a
// bar slides it to the middle. Each month's bar is its net (adds minus
// withdrawals) as a positive height, red when withdrawals won; a month with
// nothing in it is a dot. `months` is [{ name, net }], `initialIndex` the one
// that starts in the middle. Once it has settled the row drifts a bar to one
// side and back, so it's plain that it moves; the first touch cuts that short.
function MonthSlider({ months, initialIndex, light = false }) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState(initialIndex);
  const scrollRef = useRef(null);
  const centred = useRef(false);
  // The month in the middle as the scroll handler last saw it. That handler runs
  // on the UI thread, so it can tell whether a scroll event changed the month
  // without a round trip to JS, and only calls across when it did.
  const lastIndex = useSharedValue(initialIndex);
  // While the drift is running the row is moving without anyone having chosen
  // a month, so the selection and its tick stay where they are. A shared value,
  // because the scroll handler that has to respect it isn't on the JS thread.
  const nudging = useSharedValue(false);
  const timers = useRef([]);

  const max = useMemo(() => Math.max(...months.map(m => Math.abs(m.net)), 1), [months]);
  const current = months[Math.min(selected, months.length - 1)];

  const stopNudge = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    nudging.value = false;
  }, [nudging]);

  const select = useCallback((i) => {
    setSelected(i);
    hapticTick();
  }, []);

  const lastMonth = months.length - 1;
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      if (nudging.value) return;
      const raw = Math.round(e.contentOffset.x / STEP);
      const i = raw < 0 ? 0 : raw > lastMonth ? lastMonth : raw;
      if (i !== lastIndex.value) {
        lastIndex.value = i;
        runOnJS(select)(i);
      }
    },
  });

  const goTo = useCallback((i, animated = true) => scrollRef.current?.scrollTo({ x: i * STEP, y: 0, animated }), []);
  // A month chosen by hand (a tap, or a screen reader) also ends any drift.
  const pick = useCallback((i) => { stopNudge(); goTo(i); }, [stopNudge, goTo]);

  // Toward the earlier month when there is one, else the next. Skipped for
  // anyone with reduce-motion on.
  useEffect(() => {
    if (months.length < 2) return undefined;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled || reduce) return;
      const dir = initialIndex > 0 ? -1 : 1;
      const later = (ms, fn) => timers.current.push(setTimeout(fn, ms));
      later(NUDGE_START_MS, () => { nudging.value = true; goTo(initialIndex + dir); });
      later(NUDGE_BACK_MS, () => goTo(initialIndex));
      later(NUDGE_END_MS, () => { nudging.value = false; });
    }).catch(reportError);
    return () => { cancelled = true; stopNudge(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // iOS honours `contentOffset` on mount; Android needs the scrollTo once the
  // padded content has a size. Both land on the same spot.
  const onContentSizeChange = useCallback(() => {
    if (centred.current) return;
    centred.current = true;
    goTo(initialIndex, false);
  }, [goTo, initialIndex]);

  const figure = current.net === 0 ? money(0) : `${current.net > 0 ? '+' : '−'}${money(Math.abs(current.net))}`;
  const figureColor = current.net === 0 ? dim(light, 0.4) : current.net > 0 ? POSITIVE : RED_TEXT;

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Text style={{ textAlign: 'center', fontSize: 14, fontWeight: '500', color: figureColor, height: 20 }}>{figure}</Text>

      <View style={{ height: CHART_H, marginTop: 8 }}>
        {width > 0 && (
          <Animated.ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={STEP}
            decelerationRate="fast"
            scrollEventThrottle={16}
            onScroll={onScroll}
            onScrollBeginDrag={stopNudge}
            onContentSizeChange={onContentSizeChange}
            contentOffset={{ x: initialIndex * STEP, y: 0 }}
            contentContainerStyle={{ paddingHorizontal: (width - STEP) / 2 }}
            accessibilityRole="adjustable"
            accessibilityLabel="Savings by month"
            accessibilityValue={{ text: `${current.name}, ${figure}` }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) => pick(Math.max(0, Math.min(months.length - 1, selected + (e.nativeEvent.actionName === 'increment' ? 1 : -1))))}
          >
            {months.map((m, i) => (
              <MonthBar key={i} index={i} net={m.net} max={max} on={i === selected} light={light} onPick={pick} />
            ))}
          </Animated.ScrollView>
        )}
      </View>

      <Text style={{ textAlign: 'center', fontSize: 13, color: dim(light, 0.4), marginTop: 10 }}>{current.name}</Text>
    </View>
  );
}

export default memo(MonthSlider);
