import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import ReanimatedView, {
  useSharedValue, useAnimatedStyle, useAnimatedReaction,
  withSpring, runOnJS, interpolate, Extrapolation,
} from 'react-native-reanimated';
import { getDaysInMonth, parseISO } from 'date-fns';
import { toDateStr } from '../utils/format';
import { MONTH_NAMES } from '../utils/monthlyRecap';
import { hapticScrollTick } from '../utils/haptics';
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
// Past this, a row is at the end of every one of those ramps — see WheelRow.
const WHEEL_FAR = 2 * WHEEL_ITEM_H;

// One row of the wheel. Its own component (not a style built in the parent
// and handed down) because each needs its own `useAnimatedStyle` worklet
// reading the shared `offset` — hooks can't be called in a loop, so the loop
// has to be a list of components instead.
export const WheelRow = memo(function WheelRow({ offset, index, label, primaryColor }) {
  const style = useAnimatedStyle(() => {
    const d = offset.value - index * WHEEL_ITEM_H;
    // Past the end of the ramps below every row looks exactly the same (the
    // interpolations all CLAMP there), so the far ones are handed those end
    // values outright instead of solving four interpolations to arrive at them.
    // Identical on screen, and it matters because EVERY row of a wheel has one
    // of these worklets running every frame while it turns, not just the handful
    // in the window: a date wheel is 60 rows across its three columns, and the
    // dozen or so visible ones are the only ones whose numbers actually change.
    if (d <= -WHEEL_FAR || d >= WHEEL_FAR) {
      return { opacity: 0.2, transform: [{ perspective: 500 }, { rotateX: d < 0 ? '-42deg' : '42deg' }, { scale: 0.82 }] };
    }
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
});

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

// Where the column sits is its OWN business, from `initialIndex` onwards — it is
// told what it is scrolling through and reports what it lands on, and nothing is
// ever pushed back in. That is the whole reason a turn is smooth: a column
// reports the row under the centre as it passes, so the parent's state (and the
// date it builds from it) changes dozens of times a second, and anything taken
// back from the parent would mean re-rendering — and re-configuring a live pan
// gesture — in the middle of the drag driving it.
//
// The one thing a column has to follow is its list getting SHORTER under it:
// 31 March, then the month wheel turns to April. That arrives as `items`, and is
// handled by clamping below rather than by being told an index.
//
// memo'd, with every row below it memo'd too, so the columns a turn doesn't
// touch skip the work entirely.
const WheelColumn = memo(function WheelColumn({ items, initialIndex, onSelect, light, width, visibleRows = WHEEL_VISIBLE }) {
  const itemCount = items.length;
  const height = WHEEL_ITEM_H * visibleRows;
  const pad = (height - WHEEL_ITEM_H) / 2;
  const limit = (itemCount - 1) * WHEEL_ITEM_H;
  // Read once, at mount: `initialIndex` later in the column's life is a value it
  // reported itself.
  const offset = useSharedValue(initialIndex * WHEEL_ITEM_H);
  const grabOffset = useSharedValue(initialIndex * WHEEL_ITEM_H);

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // No haptic per row any more, on the wheel: each one is a native call on the
  // same thread the drag is being handled on, and three columns' worth of them
  // during a spin was its own source of stutter. The tick is on the settle
  // instead (see snapTo), one per turn.
  const tick = useCallback(idx => onSelectRef.current(idx), []);

  // Pulled back onto the last row the list still has, when it has just lost the
  // one the wheel was on.
  useEffect(() => {
    if (Math.round(offset.value / WHEEL_ITEM_H) <= itemCount - 1) return;
    offset.value = withSpring(limit, DATE_WHEEL_SPRING);
    onSelectRef.current(itemCount - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemCount]);

  // The value follows the wheel as it turns, not only once it settles.
  useAnimatedReaction(
    () => Math.max(0, Math.min(itemCount - 1, Math.round(offset.value / WHEEL_ITEM_H))),
    (idx, prevIdx) => {
      if (prevIdx !== null && idx !== prevIdx) runOnJS(tick)(idx);
    },
  );

  // One light tick as the wheel comes to rest, in place of the per-row ones.
  const settled = useCallback(index => { hapticScrollTick(); onSelectRef.current(index); }, []);

  // Built once per item count, not per render — see this component's own
  // comment. Everything it captures is either a shared value or stable.
  const pan = useMemo(() => {
    function snapTo(index) {
      'worklet';
      const clamped = Math.max(0, Math.min(itemCount - 1, index));
      offset.value = withSpring(clamped * WHEEL_ITEM_H, DATE_WHEEL_SPRING, finished => {
        if (finished) runOnJS(settled)(clamped);
      });
    }
    return Gesture.Pan()
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemCount, limit, height, settled]);

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
});

// Up to next year, for dates still to come (a loan's next EMI in January); a picker
// given a `maxDate` is cut off at that date's year.
const DATE_WHEEL_MAX_YEAR = new Date().getFullYear() + 1;
const DATE_WHEEL_MIN_YEAR = new Date().getFullYear() - 15;
const NOTIFY_MS = 100;
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
export function DateWheelPicker({ value, onChange, light, maxDate }) {
  // `maxDate`, when given, is the last date that can be picked: the wheels simply
  // stop there (no later day or month in that year to scroll to), and a starting
  // value past it is brought back to it.
  const max = maxDate ? parseISO(maxDate) : null;
  const parsed = parseISO(value);
  const selected = max && parsed > max ? max : parsed;
  const [year, setYear] = useState(selected.getFullYear());
  const [month, setMonth] = useState(selected.getMonth());
  const daysInMonth = getDaysInMonth(new Date(year, month, 1));
  const atMaxYear = !!max && year === max.getFullYear();
  const monthLimit = atMaxYear ? max.getMonth() + 1 : 12;
  const dayLimit = atMaxYear && month === max.getMonth() ? max.getDate() : daysInMonth;
  const [day, setDay] = useState(Math.min(selected.getDate(), dayLimit));

  const dayItems = useMemo(() => Array.from({ length: dayLimit }, (_, i) => String(i + 1)), [dayLimit]);
  const monthItems = useMemo(() => MONTH_NAMES.slice(0, monthLimit), [monthLimit]);
  const lastYear = max ? max.getFullYear() : DATE_WHEEL_MAX_YEAR;
  const yearItems = useMemo(() => DATE_WHEEL_YEARS.filter(y => y <= lastYear).map(String), [lastYear]);

  useEffect(() => {
    if (month > monthLimit - 1) setMonth(monthLimit - 1);
  }, [monthLimit, month]);
  useEffect(() => {
    if (day > dayLimit) setDay(dayLimit);
  }, [dayLimit, day]);

  // Stable, so a column's own report can never re-render the two beside it
  // (WheelColumn is memo'd — see its own comment).
  const pickDay = useCallback(i => setDay(i + 1), []);
  const pickYear = useCallback(i => setYear(DATE_WHEEL_MIN_YEAR + i), []);

  // Where each column opens. Read once per column, at mount: a column owns its
  // own position from then on, and the date above is built from what the three
  // of them report. Taking a position back in would be handing a column the
  // value it just reported, mid-drag.
  const start = useRef(null);
  if (!start.current) start.current = { day: Math.min(selected.getDate(), dayLimit) - 1, month: selected.getMonth(), year: selected.getFullYear() - DATE_WHEEL_MIN_YEAR };

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // Passed up at most every NOTIFY_MS while the wheels turn (and always once
  // they stop): each report re-renders the whole sheet around this picker, which
  // is what made the wheels stutter when it happened on every row.
  const lastSent = useRef(0);
  const sendTimer = useRef(null);
  const latest = useRef(null);
  useEffect(() => {
    latest.current = toDateStr(new Date(year, Math.min(month, monthLimit - 1), Math.min(day, dayLimit)));
    const send = () => { lastSent.current = Date.now(); onChangeRef.current(latest.current); };
    clearTimeout(sendTimer.current);
    const wait = NOTIFY_MS - (Date.now() - lastSent.current);
    if (wait <= 0) send(); else sendTimer.current = setTimeout(send, wait);
  }, [year, month, day, monthLimit, dayLimit]);
  useEffect(() => () => {
    if (sendTimer.current) { clearTimeout(sendTimer.current); onChangeRef.current(latest.current); }
  }, []);

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: 8, right: 8, top: DATE_WHEEL_PAD, height: WHEEL_ITEM_H, borderRadius: WHEEL_ITEM_H / 2, backgroundColor: dim(light, 0.10) }}
      />
      <WheelColumn items={dayItems} initialIndex={start.current.day} onSelect={pickDay} light={light} width={56} visibleRows={DATE_WHEEL_VISIBLE} />
      <WheelColumn items={monthItems} initialIndex={start.current.month} onSelect={setMonth} light={light} width={140} visibleRows={DATE_WHEEL_VISIBLE} />
      <WheelColumn items={yearItems} initialIndex={start.current.year} onSelect={pickYear} light={light} width={80} visibleRows={DATE_WHEEL_VISIBLE} />
    </View>
  );
}
