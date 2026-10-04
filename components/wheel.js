import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import ReanimatedView, {
  useSharedValue, useAnimatedStyle, useAnimatedReaction,
  withSpring, runOnJS, interpolate, Extrapolation,
} from 'react-native-reanimated';
import { getDaysInMonth, parseISO } from 'date-fns';
import { toDateStr } from '../utils/format';
import { MONTH_NAMES } from '../utils/monthlyRecap';
import { hapticTick } from '../utils/haptics';
import { textColor } from '../utils/colors';
import { FONT } from '../utils/type';
import { dim } from './savingsShared';

// The iOS-style wheel pieces shared by the goal sheets (a wheel of suggestions)
// and the date pickers (Day / Month / Year): one row of a wheel, one scrolling
// column, and the three-column date wheel built from them.

export const WHEEL_ITEM_H = 40;
// 3, not 5 — a peek row above and below the centre is enough to read as a
// wheel; a 5-row window left a couple of rows' worth of dead space above the
// first option (and below the last) whenever the wheel opened on either end
// of a short list, which is most of the time here.
const WHEEL_VISIBLE = 3;
export const WHEEL_H = WHEEL_ITEM_H * WHEEL_VISIBLE;
export const WHEEL_PAD = (WHEEL_H - WHEEL_ITEM_H) / 2; // centres item 0 at offset 0
export const WHEEL_OVERSCROLL = WHEEL_ITEM_H * 0.6;
// Distance (in item-heights) either side of centre the barrel tilt/scale/
// opacity ramps are solved over.
const WHEEL_TILT_RANGE = [-2 * WHEEL_ITEM_H, -WHEEL_ITEM_H, 0, WHEEL_ITEM_H, 2 * WHEEL_ITEM_H];

// One row of the wheel. Its own component (not a style built in the parent
// and handed down) because each needs its own `useAnimatedStyle` worklet
// reading the shared `offset` — hooks can't be called in a loop, so the loop
// has to be a list of components instead.
export function WheelRow({ offset, index, label, primaryColor }) {
  const style = useAnimatedStyle(() => {
    const d = offset.value - index * WHEEL_ITEM_H;
    return {
      opacity: interpolate(d, WHEEL_TILT_RANGE, [0.2, 0.45, 1, 0.45, 0.2], Extrapolation.CLAMP),
      transform: [
        // perspective first — it has to precede rotateX in the transform
        // array for the 3D tilt to actually read as depth instead of a flat
        // vertical squash.
        { perspective: 500 },
        { rotateX: `${interpolate(d, WHEEL_TILT_RANGE, [-42, -21, 0, 21, 42], Extrapolation.CLAMP)}deg` },
        { scale: interpolate(d, WHEEL_TILT_RANGE, [0.82, 0.92, 1, 0.92, 0.82], Extrapolation.CLAMP) },
      ],
    };
  });

  return (
    <ReanimatedView.View style={[{ height: WHEEL_ITEM_H, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text numberOfLines={1} style={{ fontSize: FONT.title, color: primaryColor }}>
        {label}
      </Text>
    </ReanimatedView.View>
  );
}

// One column of the date wheel below — WheelPicker's own physics (drag,
// flick, tap-a-row, the haptic tick as each option crosses centre), just
// sized to a column's width instead of the full row and without its own
// pill, since the three columns below share one continuous pill drawn once
// by their parent rather than each drawing a separate one.
// A softer, heavier settle than the suggestion wheel's own snap (below) —
// this one spins several items on a flick rather than just the next one or
// two, which is what actually reads as a physical wheel with momentum
// rather than a list that snaps to the nearest row.
const DATE_WHEEL_SPRING = { damping: 26, stiffness: 170, mass: 0.9 };

function WheelColumn({ items, index: selectedIndex, onSelect, light, width, visibleRows = WHEEL_VISIBLE }) {
  const itemCount = items.length;
  const height = WHEEL_ITEM_H * visibleRows;
  const pad = (height - WHEEL_ITEM_H) / 2;
  const limit = (itemCount - 1) * WHEEL_ITEM_H;
  const offset = useSharedValue(selectedIndex * WHEEL_ITEM_H);
  const grabOffset = useSharedValue(selectedIndex * WHEEL_ITEM_H);

  // The day column's own item count changes as the month/year columns
  // move (31 March -> April has only 30 days) — when the caller clamps
  // `index` in response, follow it here rather than leaving the wheel
  // pointing at a row that's no longer under it.
  useEffect(() => {
    offset.value = withSpring(selectedIndex * WHEEL_ITEM_H, DATE_WHEEL_SPRING);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex]);

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const commit = useCallback(index => onSelectRef.current(index), []);
  const tick = useCallback(() => hapticTick(), []);

  useAnimatedReaction(
    () => Math.round(offset.value / WHEEL_ITEM_H),
    (idx, prevIdx) => {
      if (prevIdx !== null && idx !== prevIdx) runOnJS(tick)();
    },
  );

  function snapTo(index) {
    'worklet';
    const clamped = Math.max(0, Math.min(itemCount - 1, index));
    offset.value = withSpring(clamped * WHEEL_ITEM_H, DATE_WHEEL_SPRING, finished => {
      if (finished) runOnJS(commit)(clamped);
    });
  }

  const pan = Gesture.Pan()
    .onStart(() => {
      grabOffset.value = offset.value;
    })
    .onUpdate(e => {
      const next = grabOffset.value - e.translationY;
      offset.value = Math.max(-WHEEL_OVERSCROLL, Math.min(limit + WHEEL_OVERSCROLL, next));
    })
    .onEnd(e => {
      const movedFar = Math.abs(e.translationY) > 5 || Math.abs(e.translationX) > 5;
      if (!movedFar) {
        const rows = Math.round((e.y - height / 2) / WHEEL_ITEM_H);
        snapTo(Math.round(offset.value / WHEEL_ITEM_H) + rows);
        return;
      }
      // A longer throw than the suggestion wheel's own 0.12 — the wheel
      // keeps spinning past where the finger let go, proportional to how
      // fast it was moving, instead of stopping almost where it was
      // released.
      const projected = offset.value - e.velocityY * 0.3;
      snapTo(Math.round(projected / WHEEL_ITEM_H));
    })
    .onFinalize((_e, success) => {
      if (!success) snapTo(Math.round(offset.value / WHEEL_ITEM_H));
    });

  const columnStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -offset.value }] }));
  const primaryColor = textColor(light).primary;

  return (
    <GestureDetector gesture={pan}>
      <View style={{ width, height, overflow: 'hidden' }}>
        <ReanimatedView.View style={[{ paddingTop: pad }, columnStyle]}>
          {items.map((item, i) => (
            <WheelRow key={i} offset={offset} index={i} label={item} primaryColor={primaryColor} />
          ))}
        </ReanimatedView.View>
      </View>
    </GestureDetector>
  );
}

const DATE_WHEEL_MAX_YEAR = new Date().getFullYear();
const DATE_WHEEL_MIN_YEAR = DATE_WHEEL_MAX_YEAR - 15;
const DATE_WHEEL_YEARS = Array.from({ length: DATE_WHEEL_MAX_YEAR - DATE_WHEEL_MIN_YEAR + 1 }, (_, i) => DATE_WHEEL_MIN_YEAR + i);
// Taller than the suggestion wheel's 3-row window (WHEEL_VISIBLE) — a date
// wheel is scrolled through fast and far (16 years, 31 days), so more of
// the barrel showing above and below centre reads as an actual wheel curving
// away rather than a short list peeking at its neighbours.
const DATE_WHEEL_VISIBLE = 5;
const DATE_WHEEL_PAD = (WHEEL_ITEM_H * DATE_WHEEL_VISIBLE - WHEEL_ITEM_H) / 2;

// The three-column Day / Month / Year wheel iOS's own date picker uses,
// built out of WheelColumn above rather than a month-grid: a decade-plus of
// year navigation is a handful of flicks here instead of dozens of taps on
// a grid's prev/next arrows, and it matches the suggestion wheel every
// other row on this sheet already opens into, instead of looking like a
// second, unrelated kind of input.
export function DateWheelPicker({ value, onChange, light }) {
  const selected = parseISO(value);
  const [year, setYear] = useState(selected.getFullYear());
  const [month, setMonth] = useState(selected.getMonth());
  const daysInMonth = getDaysInMonth(new Date(year, month, 1));
  const [day, setDay] = useState(Math.min(selected.getDate(), daysInMonth));

  const dayItems = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => String(i + 1)), [daysInMonth]);
  const yearItems = useMemo(() => DATE_WHEEL_YEARS.map(String), []);

  useEffect(() => {
    if (day > daysInMonth) setDay(daysInMonth);
  }, [daysInMonth, day]);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    onChangeRef.current(toDateStr(new Date(year, month, Math.min(day, daysInMonth))));
  }, [year, month, day, daysInMonth]);

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: 8, right: 8, top: DATE_WHEEL_PAD, height: WHEEL_ITEM_H, borderRadius: WHEEL_ITEM_H / 2, backgroundColor: dim(light, 0.10) }}
      />
      <WheelColumn items={dayItems} index={day - 1} onSelect={i => setDay(i + 1)} light={light} width={56} visibleRows={DATE_WHEEL_VISIBLE} />
      <WheelColumn items={MONTH_NAMES} index={month} onSelect={setMonth} light={light} width={140} visibleRows={DATE_WHEEL_VISIBLE} />
      <WheelColumn items={yearItems} index={year - DATE_WHEEL_MIN_YEAR} onSelect={i => setYear(DATE_WHEEL_MIN_YEAR + i)} light={light} width={80} visibleRows={DATE_WHEEL_VISIBLE} />
    </View>
  );
}
