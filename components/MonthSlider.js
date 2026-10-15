import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, TextInput } from 'react-native';
import Animated, { runOnJS, useAnimatedProps, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { hapticScrollTick } from '../utils/haptics';
import { POSITIVE, dim, money } from './savingsShared';
import { textColor } from '../utils/colors';
import { FONT } from '../utils/type';

// Width each month takes along the slider, and the bar drawn inside it.
const STEP = 28;
const BAR_W = 10;
const CHART_H = 80;
const DOT = 5;

const GREEN = { active: 'rgba(74,222,128,0.95)', dim: 'rgba(74,222,128,0.5)' };
const RED = { active: 'rgba(255,75,75,0.92)', dim: 'rgba(255,75,75,0.45)' };
const RED_TEXT = 'rgba(255,75,75,0.92)';

// `onSettle` is told only once the row has actually stopped (see reportSettled),
// never mid-drag: whatever hangs off it re-renders, and doing that while a finger is
// still moving the row is what made it catch. These are the fallbacks for a
// release with no glide after it, and for a tap, whose slide may not report its end.
const DRAG_END_MS = 120;
const TAP_END_MS = 420;
// The slider's haptic: the lightest tick, and spaced out so a fling is a soft
// patter rather than a buzz.
const TICK_GAP_MS = 80;

// One month's bar, or a dot when nothing moved. Which one is lit is read from
// `sel`, the month in the middle as the scroll handler sees it, on the UI thread:
// the highlight moves the instant the row reaches a new month, and sliding
// re-renders none of the bars on the JS side. `restGrey` rests grey instead of
// red/green (the lit one is always in colour).
const MonthBar = memo(function MonthBar({ index, net, max, light, onPick, restGrey, sel }) {
  const tone = net < 0 ? RED : GREEN;
  const rest = restGrey ? dim(light, 0.2) : tone.dim;
  const lit = tone.active;
  const dotRest = dim(light, 0.2);
  const dotLit = dim(light, 0.6);
  const h = net === 0 ? 0 : Math.max(4, Math.round((Math.abs(net) / max) * CHART_H));
  const barStyle = useAnimatedStyle(() => ({ backgroundColor: sel.value === index ? lit : rest }));
  const dotStyle = useAnimatedStyle(() => ({ backgroundColor: sel.value === index ? dotLit : dotRest }));
  return (
    <Pressable onPress={() => onPick(index)} style={{ width: STEP, height: CHART_H, alignItems: 'center', justifyContent: 'flex-end' }}>
      {h > 0 ? (
        <Animated.View style={[{ width: BAR_W, height: h, borderRadius: BAR_W / 2 }, barStyle]} />
      ) : (
        <Animated.View style={[{ width: DOT, height: DOT, borderRadius: DOT / 2, marginBottom: (BAR_W - DOT) / 2 }, dotStyle]} />
      )}
    </Pressable>
  );
});

// A line of text that follows `sel` on the UI thread: `texts[sel]`, coloured
// `colors[sel]` when given. A read-only TextInput is the one text view whose
// content can be set from there, so the figure and month change as the row passes
// each month without a React render, which is what kept the slide from catching.
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);
function LiveText({ texts, colors, sel, initial, style }) {
  const textProps = useAnimatedProps(() => ({ text: texts[sel.value] ?? '' }));
  const colorStyle = useAnimatedStyle(() => (colors ? { color: colors[sel.value] } : {}));
  return (
    <AnimatedTextInput
      editable={false}
      pointerEvents="none"
      accessible={false}
      underlineColorAndroid="transparent"
      defaultValue={texts[initial] ?? ''}
      animatedProps={textProps}
      style={[{ padding: 0, margin: 0, includeFontPadding: false, textAlign: 'center' }, style, colorStyle]}
    />
  );
}

// A row of monthly bars that slides under a fixed centre: the bar in the middle
// is the selected one, drawn at full strength with its figure above and its
// month below, and the row snaps to a bar when it comes to rest. The highlight
// itself is handled on the UI thread (see MonthBar). A tap on a
// bar slides it to the middle. Each month's bar is its net (adds minus
// withdrawals) as a positive height, red when withdrawals won; a month with
// nothing in it is a dot. `months` is [{ name, net }], `initialIndex` the one
// that starts in the middle. `currentIndex`, when given, is the one month that rests
// in colour; every other bar rests grey (the selected one is always lit).
function MonthSlider({ months, initialIndex, light = false, label = 'Savings by month', onSettle, currentIndex }) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState(initialIndex);
  const scrollRef = useRef(null);
  const centred = useRef(false);
  // The month in the middle as the scroll handler last saw it. That handler runs
  // on the UI thread, so it can tell whether a scroll event changed the month
  // without a round trip to JS, and only calls across when it did.
  const lastIndex = useSharedValue(initialIndex);
  const max = useMemo(() => Math.max(...months.map(m => Math.abs(m.net)), 1), [months]);
  const current = months[Math.min(selected, months.length - 1)];

  // Passing a month is only a tick on the JS side: the bars, figure and month
  // all follow on the UI thread. `selected` (for the screen reader) catches up
  // once the row stops (see reportSettled).
  const tick = useCallback(() => hapticScrollTick(TICK_GAP_MS), []);

  // Tells the parent which month the row has come to rest on, once it has stopped
  // moving, and only when that's a different month from the last one reported.
  const onSettleRef = useRef(onSettle);
  onSettleRef.current = onSettle;
  const reported = useRef(initialIndex);
  const endTimer = useRef(null);
  const reportSettled = useCallback((i) => {
    clearTimeout(endTimer.current);
    setSelected(i);
    if (i === reported.current) return;
    reported.current = i;
    onSettleRef.current?.(i);
  }, []);
  useEffect(() => () => clearTimeout(endTimer.current), []);
  const onScrollEndDrag = useCallback(() => {
    clearTimeout(endTimer.current);
    endTimer.current = setTimeout(() => reportSettled(lastIndex.value), DRAG_END_MS);
  }, [reportSettled, lastIndex]);
  const onMomentumScrollBegin = useCallback(() => clearTimeout(endTimer.current), []);
  const onMomentumScrollEnd = useCallback(() => reportSettled(lastIndex.value), [reportSettled, lastIndex]);

  const lastMonth = months.length - 1;
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      const raw = Math.round(e.contentOffset.x / STEP);
      const i = raw < 0 ? 0 : raw > lastMonth ? lastMonth : raw;
      if (i !== lastIndex.value) {
        lastIndex.value = i;
        runOnJS(tick)();
      }
    },
  });

  const goTo = useCallback((i, animated = true) => scrollRef.current?.scrollTo({ x: i * STEP, y: 0, animated }), []);
  // A month chosen by hand: a tap, or a screen reader.
  const pick = useCallback((i) => {
    goTo(i);
    clearTimeout(endTimer.current);
    endTimer.current = setTimeout(() => reportSettled(i), TAP_END_MS);
  }, [goTo, reportSettled]);

  // iOS honours `contentOffset` on mount; Android needs the scrollTo once the
  // padded content has a size. Both land on the same spot.
  const onContentSizeChange = useCallback(() => {
    if (centred.current) return;
    centred.current = true;
    goTo(initialIndex, false);
  }, [goTo, initialIndex]);

  // Built once, not on every month the row passes: the bars light themselves (see
  // MonthBar), so a change of selection leaves this list exactly as it was.
  const bars = useMemo(() => months.map((m, i) => (
    <MonthBar key={i} index={i} net={m.net} max={max} light={light} onPick={pick} restGrey={currentIndex != null && i !== currentIndex} sel={lastIndex} />
  )), [months, max, light, pick, currentIndex, lastIndex]);

  const formatNet = (net) => (net === 0 ? money(0) : `${net > 0 ? '+' : '−'}${money(Math.abs(net))}`);
  const figure = formatNet(current.net);
  // Every month's figure, colour and name up front, for LiveText to pick from.
  const figures = useMemo(() => months.map(m => formatNet(m.net)), [months]);
  const figureColors = useMemo(() => months.map(m => (m.net === 0 ? textColor(light).tertiary : m.net > 0 ? POSITIVE : RED_TEXT)), [months, light]);
  const names = useMemo(() => months.map(m => m.name), [months]);

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <LiveText texts={figures} colors={figureColors} sel={lastIndex} initial={initialIndex} style={{ fontSize: FONT.caption, fontWeight: '500', height: 20 }} />

      <View style={{ height: CHART_H, marginTop: 8 }}>
        {width > 0 && (
          <Animated.ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={STEP}
            decelerationRate="normal"
            scrollEventThrottle={16}
            onScroll={onScroll}
            onScrollEndDrag={onScrollEndDrag}
            onMomentumScrollBegin={onMomentumScrollBegin}
            onMomentumScrollEnd={onMomentumScrollEnd}
            onContentSizeChange={onContentSizeChange}
            contentOffset={{ x: initialIndex * STEP, y: 0 }}
            contentContainerStyle={{ paddingHorizontal: (width - STEP) / 2 }}
            accessibilityRole="adjustable"
            accessibilityLabel={label}
            accessibilityValue={{ text: `${current.name}, ${figure}` }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) => pick(Math.max(0, Math.min(months.length - 1, selected + (e.nativeEvent.actionName === 'increment' ? 1 : -1))))}
          >
            {bars}
          </Animated.ScrollView>
        )}
      </View>

      <LiveText texts={names} sel={lastIndex} initial={initialIndex} style={{ fontSize: FONT.caption, color: textColor(light).tertiary, marginTop: 10, height: 18 }} />
    </View>
  );
}

export default memo(MonthSlider);
