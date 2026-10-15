import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, Pressable, InteractionManager } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { parseISO } from 'date-fns';
import TransactionItem from './TransactionItem';
import { ChevronRight } from './icons';
import { formatCurrency } from '../utils/format';
import { textColor, INCOME_TEXT } from '../utils/colors';
import { BODY, TABULAR } from '../utils/type';
import { GUTTER, LEDGER_PILL_INSET } from '../utils/spacing';
import { MONTH_NAMES } from '../utils/monthlyRecap';
import { RANGE_FADE_MS, SETTLE_EASING, SPRING_SMOOTH, layoutTransition } from '../utils/motion';

// SPRING_SMOOTH — the app's calmer preset, for heavier content reflowing
// (a taller list row settling into place reads better a bit more gently
// than AmountField's narrow digit sliding, which uses SPRING_QUICK).
const ROW_LAYOUT_TRANSITION = layoutTransition(SPRING_SMOOTH);

// Plays once, only for the row TransactionList is told just got added (see
// justAddedId) — a plain fade + small rise, no stagger, since there's only
// ever one of these at a time.
function rowEntering() {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 14 }] },
    animations: {
      opacity: withTiming(1, { duration: 320, easing: SETTLE_EASING }),
      transform: [{ translateY: withTiming(0, { duration: 320, easing: SETTLE_EASING }) }],
    },
  };
}

// A range change crossfades the two lists (see RANGE_FADE_MS): the old one fades
// out as the new one fades in, both at once, with no movement.
const RANGE_TIMING = { duration: RANGE_FADE_MS, easing: Easing.inOut(Easing.quad) };

function rangeExiting() {
  'worklet';
  return {
    initialValues: { opacity: 1 },
    animations: { opacity: withTiming(0, RANGE_TIMING) },
  };
}

function rangeEntering() {
  'worklet';
  return {
    initialValues: { opacity: 0 },
    animations: { opacity: withTiming(1, RANGE_TIMING) },
  };
}

// The motions a group opens and closes with. Overdamped on purpose (damping is
// just past 2·sqrt(stiffness·mass)): a spring keeps velocity continuous, so
// the content below is carried along without a start or a stop, but height must
// never overshoot its natural size or the group would visibly spring past it and
// come back. Soft and unhurried rather than snappy — the whole column below moves
// with it, and that reads better taking its time.
const OPEN_SPRING = { damping: 24, stiffness: 135, mass: 0.9 };
// Closing is brisker than opening: there is nothing to read on the way out, and a
// group that lingers while it empties feels slow. Overdamped as well, so the
// height still cannot overshoot and bounce.
const CLOSE_SPRING = { damping: 26, stiffness: 240, mass: 0.7 };

// A transaction row's and a header's own height, used only as the opening height
// of a group that has never been measured yet (the first frame of the very first
// open). Both are fixed: every row is one line (numberOfLines={1} throughout) over
// a 30pt date pill, padded 12 top and bottom; a header is one line padded 14. The
// real height replaces these as soon as the group has been laid out once.
// Long enough to be clear of the spring's last frames, short enough that a group
// reopened by a quick second tap has not been torn down yet.
const TEARDOWN_DELAY_MS = 180;

// Comfortably past the opening spring, so the rows gain their swipe gestures only
// once everything has come to rest.
const ARM_AFTER_MS = 520;


// The + button floats over the bottom of the list: 48 from the screen edge plus its
// own 68 reaches 116, so the last row has to scroll up past that, with room to spare.
const FAB_CLEARANCE = 148;

const ROW_HEIGHT = 54;
const HEADER_HEIGHT = 49;

// A whole group — a month's transactions, or a year's months — opening and
// closing as ONE animated height, rather than each row animating itself. That is
// what makes it smooth in both directions and anywhere in the list: there is a
// single value moving on the UI thread, the content below is carried by the
// layout every frame, and nothing has to be kept in step with anything else.
// Fully open it carries no height of its own at all, so the group is just its
// natural size (and measures itself for the next close) and rows inside it
// behave normally.
function Collapsible({ open, estimate, onClosed, children }) {
  const natural = useSharedValue(estimate);
  const progress = useSharedValue(open ? 1 : 0);
  const [, bump] = useState(0);

  // Whether the group is on its way out is worked out as the render happens, not
  // afterwards in an effect: `open` goes false in the same commit that would stop
  // rendering the contents, so by the time an effect could say "still closing" the
  // group has already painted one frame empty and then filled itself back in —
  // which is the blink. A ref, because this has to be known in the very render
  // that learns `open` has changed.
  const prevOpen = useRef(open);
  const closing = useRef(false);
  if (prevOpen.current !== open) {
    prevOpen.current = open;
    closing.current = !open;
  }

  // Dropping the contents means unmounting a month's worth of rows and taking
  // their swipe gestures down with them — the single heaviest thing this component
  // ever does. Run on the frame the spring lands, it is a stutter right at the end
  // of the animation. The group is already at zero height by then and nothing of it
  // can be seen, so it waits a moment and tears down well clear of the motion.
  const openRef = useRef(open);
  openRef.current = open;
  const teardown = useRef(null);
  const finishClose = useCallback(() => {
    clearTimeout(teardown.current);
    teardown.current = setTimeout(() => {
      // Reopened in the meantime: its contents are wanted after all.
      if (openRef.current) return;
      closing.current = false;
      bump(n => n + 1);
      onClosed?.();
    }, TEARDOWN_DELAY_MS);
  }, [onClosed]);
  useEffect(() => () => clearTimeout(teardown.current), []);

  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    if (open) {
      progress.value = withSpring(1, OPEN_SPRING);
      return;
    }
    progress.value = withSpring(0, CLOSE_SPRING, finished => {
      if (finished) runOnJS(finishClose)();
    });
  }, [open, progress, finishClose]);

  // The height the collapse animates from must not move once that collapse has
  // started — a re-measure landing mid-animation changes the target under it and
  // the group visibly jerks. Measurements are taken only while the group is open
  // and unclipped, which is also the only time the figure means anything.
  const onLayout = useCallback(e => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && !closing.current) natural.value = h;
  }, [natural]);

  const style = useAnimatedStyle(() => (
    // Fully open must say so explicitly: an animated style that merely stops
    // returning `height` leaves the last animated value in place, so a year that
    // opened to its month headers stayed clipped at that height (overflow hidden)
    // when one of its months then opened inside it, hiding the last rows.
    progress.value === 1 ? { height: 'auto', opacity: 1, overflow: 'visible' } : { height: natural.value * progress.value, opacity: Math.min(1, Math.max(0, (progress.value - 0.15) / 0.85)), overflow: 'hidden' }
  ));

  return (
    <Animated.View style={style} pointerEvents={open ? 'auto' : 'none'}>
      <View onLayout={onLayout}>{open || closing.current ? children : null}</View>
    </Animated.View>
  );
}

// Memoised, and given props that keep their identity (see flatData and
// renderRow), so opening or closing one group doesn't re-render the rows of every
// other open group. Rebuilding a month's worth of armed rows is what put a pause
// between the tap and the collapse starting, and it grew with each month left
// open — the first header felt instant, the ones below it did not.
//
// A group's rows, armed a beat after they appear. Mounting a row's swipe gesture
// (ReanimatedSwipeable sets up a gesture handler and its worklets) is by far the
// most expensive part of putting one on screen, and a month's worth of that in
// the same commit as the tap is what put a pause between pressing a header and
// the group starting to move. The rows go up plain and gain their swipe once
// they are already there, so the tap is answered immediately.
const Group = memo(function Group({ open, rows, estimate, renderRow }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    // After the group has finished opening, not during it: wrapping a month's rows
    // in their swipe gestures re-lays the group out, and anything that changes
    // layout while the list is moving shows up as a stumble.
    const t = setTimeout(() => setArmed(true), ARM_AFTER_MS);
    return () => clearTimeout(t);
  }, [open]);
  // Deliberately NOT disarmed when the group starts closing: tearing every row's
  // swipe gesture back down mid-collapse is a whole month's worth of work landing
  // in the middle of the animation, which is exactly what made it stutter. The
  // rows are let go once the group is shut and they have left the tree anyway.
  const handleClosed = useCallback(() => setArmed(false), []);
  // The rows are built from the rows themselves and nothing else, so toggling the
  // group hands React the very same elements it already has and it skips the whole
  // subtree. Without this, every tap rebuilt a month's worth of rows before the
  // collapse could even start, which is the pause between pressing a header and
  // anything moving — and it grew with the number of rows in the group.
  const content = useMemo(() => rows.map(({ tx }) => renderRow(tx, armed)), [rows, armed, renderRow]);
  return (
    <Collapsible open={open} estimate={estimate} onClosed={handleClosed}>
      {content}
    </Collapsible>
  );
});

// How long the tour's demo swipe holds the delete button in view before closing,
// and how long the row rests shut before it swipes again.
const DEMO_SWIPE_HOLD_MS = 1300;
const DEMO_SWIPE_PAUSE_MS = 1100;

// A month's (or, on the All chart, a year's) header, laid out like a row: the
// name on the left, its total on the right, and a chevron that turns down when
// it's open. `amount` follows the Expense/Income tab. `level` 1 is a month under a
// year (All chart) and sits a little further in.
const GroupHeader = memo(function GroupHeader({ label, amount, light, isOpen, isIncome, level, toggleKey, onToggle }) {
  // The chevron swings from pointing right to pointing down on a spring, rather
  // than jumping when `isOpen` flips — on the calmer preset, so it turns at about
  // the pace the group itself opens.
  const turn = useSharedValue(isOpen ? 1 : 0);
  useEffect(() => {
    turn.value = withSpring(isOpen ? 1 : 0, SPRING_SMOOTH);
  }, [isOpen, turn]);
  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 90}deg` }] }));
  const labelColor = textColor(light)[isOpen ? 'primary' : 'secondary'];
  const handlePress = useCallback(() => onToggle(toggleKey), [onToggle, toggleKey]);
  return (
    <Pressable onPress={handlePress} accessibilityRole="button" accessibilityLabel={`${label}, ${isOpen ? 'expanded' : 'collapsed'}`}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: LEDGER_PILL_INSET + (level ? 16 : 0),
          paddingRight: LEDGER_PILL_INSET,
          paddingVertical: 14,
        }}
      >
        {/* The month and its total read as one line: the same colour as each other,
            and both brighten together when the group is open. */}
        <Text numberOfLines={1} style={[BODY, { flex: 1, color: labelColor }]}>{label}</Text>
        <Text numberOfLines={1} style={[BODY, TABULAR, { marginLeft: 16, color: isIncome ? INCOME_TEXT : labelColor }]}>{formatCurrency(amount)}</Text>
        <Animated.View style={[{ marginLeft: 10 }, chevronStyle]}>
          <ChevronRight size={16} color={textColor(light).secondary} />
        </Animated.View>
      </View>
    </Pressable>
  );
});

// `light` is a one-off experimental prop for trying a light theme on just
// the Dashboard — see the matching comment in Header.js.
function TransactionList({
  transactions,
  onEdit,
  onDelete,
  light = false,
  // Id of a transaction that was just added — that one row plays
  // rowEntering (fade + rise) and everything below it pushes down via
  // ROW_LAYOUT_TRANSITION.
  justAddedId,
  // Same Expense/Income value the Home chart's pill is on —
  // decides which figure (if any) each month's header shows, see
  // GroupHeader's own comment.
  mode = 'expense',
  // The chart's range: 'month' lists this month's transactions, 'year' this
  // year's months, '5y' (All) every year and, inside it, its months.
  timeRange = 'month',
}, ref) {
  // The page's own background, not a raised fill — the rows sit directly on
  // the screen. They still have to paint an opaque colour of their own — a
  // swiped-open row would otherwise show its own delete button through
  // itself — so this is the page colour rather than `transparent`.
  const cardColor = light ? '#FAFAF8' : '#000000';

  // Coordinates "only one swiped-open row at a time" across the whole list —
  // refs rather than state, since none of this should ever trigger a
  // re-render of its own.
  const swipeRefs = useRef(new Map());
  const openIdRef = useRef(null);

  const registerSwipeable = useCallback((id, r) => {
    if (r) swipeRefs.current.set(id, r);
    else swipeRefs.current.delete(id);
  }, []);

  // The swipe demo (see demoSwipe below) repeats until the user touches the
  // screen. The row sliding open is the whole of it — there is no caption under
  // it any more.
  const demoOnRef = useRef(false);
  const demoTimerRef = useRef(null);
  const endDemo = useCallback(() => {
    if (!demoOnRef.current) return;
    demoOnRef.current = false;
    clearTimeout(demoTimerRef.current);
  }, []);

  // Any touch anywhere reaches this (see the capture handler on Home), so it is
  // also what stops the demo.
  const closeOpenRow = useCallback(() => {
    endDemo();
    const id = openIdRef.current;
    if (id) swipeRefs.current.get(id)?.close();
    openIdRef.current = null;
  }, [endDemo]);

  const onSwipeOpen = useCallback(id => {
    const prevId = openIdRef.current;
    if (prevId && prevId !== id) swipeRefs.current.get(prevId)?.close();
    openIdRef.current = id;
  }, []);

  // Tapping any card — including the currently-open row's own — closes an
  // open swipe, same as tapping blank list space. Returns whether it did:
  // a tap that closed a row is spent on that and nothing else, so the row
  // doesn't also open itself for editing behind the closing swipe (see
  // TransactionItem's handleCardPress).
  const onCardPress = useCallback(() => {
    if (!openIdRef.current) return false;
    closeOpenRow();
    return true;
  }, [closeOpenRow]);

  // Slides the first row open to show its delete button, holds a moment, slides
  // it shut, rests, and does it again — over and over until a touch ends it (see
  // closeOpenRow). The tour uses it to show what swiping a transaction does.
  // Says whether there was a row to do it on (rows only become swipeable a moment
  // after a list paints, so the first try can find none).
  useEffect(() => () => clearTimeout(demoTimerRef.current), []);
  const firstTxIdRef = useRef(null);
  const demoSwipe = useCallback(() => {
    if (demoOnRef.current) return true;
    if (!firstTxIdRef.current || !swipeRefs.current.get(firstTxIdRef.current)) return false;
    demoOnRef.current = true;
    const run = () => {
      const id = firstTxIdRef.current;
      const swipeable = id && swipeRefs.current.get(id);
      if (!swipeable) { endDemo(); return; }
      swipeable.openRight();
      openIdRef.current = id;
      demoTimerRef.current = setTimeout(() => {
        swipeable.close();
        if (openIdRef.current === id) openIdRef.current = null;
        demoTimerRef.current = setTimeout(run, DEMO_SWIPE_PAUSE_MS);
      }, DEMO_SWIPE_HOLD_MS);
    };
    run();
    return true;
  }, [endDemo]);

  useImperativeHandle(ref, () => ({ closeOpenRow, demoSwipe }), [closeOpenRow, demoSwipe]);

  // What the list shows follows the chart above it. Month: this month's
  // transactions, no header. Year: this year's months as headers. All: a header
  // per year, with its months inside it once opened.
  //
  // Opening a group never closes another one, so the only thing that ever changes
  // size is the group BELOW the header that was tapped: nothing above it moves,
  // and the header stays exactly where the finger left it, opening or closing.
  // Several months can be read at once, and each is closed by tapping it again.
  const now = useRef(new Date()).current;
  const currentMonthKey = now.getFullYear() * 12 + now.getMonth();
  const currentYear = now.getFullYear();
  const [openKeys, setOpenKeys] = useState([]);
  const toggleGroup = useCallback(key => {
    setOpenKeys(ks => (ks.includes(key) ? ks.filter(k => k !== key) : [...ks, key]));
  }, []);
  // Changing the chart's range rebuilds the list around a different span, so
  // whatever was left open under the old one is closed. The rows that replace it
  // go up plain and gain their swipe gestures once the chart has finished sliding
  // — mounting a month of them in the same frame as the swipe is what made the
  // change drag.
  // The range changes here on the same commit the chart swaps its own data to —
  // the chart has already slid out by then and is about to slide back in with the
  // new range, and the two have to arrive together. Nothing about the swap is
  // deferred; what IS deferred is the rows gaining their swipe gestures, which is
  // the expensive part and is invisible either way.
  // The range changes here on the very commit the chart swaps its own data on, so
  // the new rows and the new chart arrive together. Whatever was left open under
  // the old range is closed, and the new rows gain their swipe gestures a little
  // later — that part is the expensive one, and it is invisible either way.
  const [rangeSettled, setRangeSettled] = useState(false);
  useEffect(() => {
    setOpenKeys([]);
    setRangeSettled(false);
    const t = setTimeout(() => setRangeSettled(true), ARM_AFTER_MS);
    return () => clearTimeout(t);
  }, [timeRange]);

  // Every month that has anything in it, newest first, with its own
  // transactions (also newest first) and BOTH an expense and an income
  // total — which one (if either) a header actually shows depends on
  // `mode`, resolved down in flatData below.
  const groups = useMemo(() => {
    const map = new Map();
    for (const tx of transactions) {
      // parseISO, not `new Date(tx.date)` — tx.date is a plain "YYYY-MM-DD",
      // and the native constructor parses a date-only string as UTC midnight
      // rather than local midnight, which can shift the month or year it
      // lands in depending on timezone. See shiftDate in utils/format.js.
      const d = parseISO(tx.date);
      const key = d.getFullYear() * 12 + d.getMonth();
      let g = map.get(key);
      if (!g) { g = { key, year: d.getFullYear(), month: d.getMonth(), expenseTotal: 0, incomeTotal: 0, items: [] }; map.set(key, g); }
      if (tx.type === 'income') g.incomeTotal += tx.amount;
      else g.expenseTotal += tx.amount;
      g.items.push({ tx, ts: d.getTime(), cts: new Date(tx.createdAt).getTime() });
    }
    const list = [...map.values()].sort((a, b) => b.key - a.key);
    for (const g of list) {
      g.items.sort((a, b) => b.ts - a.ts || b.cts - a.cts);
    }
    return list;
  }, [transactions]);

  // One flat array for FlatList. A group (a month's rows, or a year's months) is
  // a single item holding its own contents, so it can open and close as one
  // height — see Collapsible. In Month the rows are items of their own instead:
  // there is no group to open there, and one long month is better virtualized.
  const flatData = useMemo(() => {
    const figure = g => (mode === 'income' ? g.incomeTotal : g.expenseTotal);
    const monthHeader = (g, isOpen, level, scope) => ({
      type: 'header',
      key: `h-${g.key}`,
      label: MONTH_NAMES[g.month],
      amount: figure(g),
      isOpen,
      level,
      scope,
      toggleKey: g.key,
    });
    const out = [];

    if (timeRange === 'month') {
      for (const g of groups) {
        if (g.key !== currentMonthKey) continue;
        for (const { tx } of g.items) out.push({ type: 'tx', key: tx.id, tx });
      }
      return out;
    }

    if (timeRange === 'year') {
      for (const g of groups) {
        if (g.year !== currentYear) continue;
        const isOpen = openKeys.includes(g.key);
        out.push(monthHeader(g, isOpen, 0, 'year'));
        out.push({ type: 'group', key: `g-${g.key}`, rows: g.items, open: isOpen });
      }
      return out;
    }

    // All: years newest first, each with its months inside it.
    const years = [];
    for (const g of groups) {
      let y = years[years.length - 1];
      if (!y || y.year !== g.year) { y = { year: g.year, months: [], expenseTotal: 0, incomeTotal: 0 }; years.push(y); }
      y.months.push(g);
      y.expenseTotal += g.expenseTotal;
      y.incomeTotal += g.incomeTotal;
    }
    for (const y of years) {
      const yearOpen = openKeys.includes(`y${y.year}`);
      out.push({ type: 'header', key: `y-${y.year}`, label: String(y.year), amount: figure(y), isOpen: yearOpen, level: 0, scope: 'allYear', toggleKey: `y${y.year}` });
      out.push({
        type: 'yearBody',
        key: `yb-${y.year}`,
        open: yearOpen,
        months: y.months.map(g => ({ key: `g-${g.key}`, header: monthHeader(g, openKeys.includes(g.key), 1, 'allMonth'), rows: g.items, open: openKeys.includes(g.key) })),
      });
    }
    return out;
  }, [groups, currentMonthKey, currentYear, openKeys, mode, timeRange]);

  // The tour's demo swipe needs a row that is actually on screen: the first row
  // of the open group, or of the plain Month list.
  firstTxIdRef.current = (() => {
    for (const item of flatData) {
      if (item.type === 'tx') return item.key;
      if (item.type === 'group' && item.open) return item.rows[0]?.tx.id ?? null;
      if (item.type === 'yearBody' && item.open) {
        const m = item.months.find(x => x.open);
        if (m) return m.rows[0]?.tx.id ?? null;
      }
    }
    return null;
  })();

  // False for the first commit only, true once it has settled. Gates the
  // two per-row costs that profiling showed dominate a first paint —
  // ReanimatedSwipeable's gesture/worklet setup and the layout transition —
  // so the rows paint immediately and the animation machinery arrives a
  // frame or two later, off the critical path. Stays true from then on: a
  // later add/edit/delete just animates normally.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (settled) return undefined;
    const handle = InteractionManager.runAfterInteractions(() => setSettled(true));
    return () => handle.cancel();
  }, [settled]);

  // Hoisted rather than inlined at the call site so memo(TransactionItem)
  // keeps getting stable props and can actually bail out of re-rendering
  // rows that haven't changed.
  const renderRow = useCallback((tx, armed = true) => (
    <Animated.View
      key={tx.id}
      layout={settled && armed ? ROW_LAYOUT_TRANSITION : undefined}
      entering={tx.id === justAddedId ? rowEntering : undefined}
      style={{ backgroundColor: cardColor }}
    >
      <TransactionItem
        tx={tx}
        isIncome={tx.type === 'income'}
        onEdit={onEdit}
        onDelete={onDelete}
        registerSwipeable={registerSwipeable}
        onSwipeOpen={onSwipeOpen}
        onCardPress={onCardPress}
        light={light}
        cardColor={cardColor}
        swipeable={settled && armed}
      />
    </Animated.View>
  ), [settled, justAddedId, cardColor, onEdit, onDelete, registerSwipeable, onSwipeOpen, onCardPress, light]);

  const renderHeader = useCallback((item) => (
    <GroupHeader
      label={item.label}
      amount={item.amount}
      light={light}
      isOpen={item.isOpen}
      isIncome={mode === 'income'}
      level={item.level}
      toggleKey={item.toggleKey}
      onToggle={toggleGroup}
    />
  ), [light, mode, toggleGroup]);

  const renderItem = useCallback(({ item }) => {
    if (item.type === 'tx') return renderRow(item.tx, rangeSettled);
    if (item.type === 'header') return renderHeader(item);
    if (item.type === 'group') {
      return <Group open={item.open} rows={item.rows} estimate={item.rows.length * ROW_HEIGHT} renderRow={renderRow} />;
    }
    // A year: its months, each of which opens and closes inside it. The year's own
    // height is natural while it is open, so a month opening simply grows it.
    return (
      <Collapsible open={item.open} estimate={item.months.length * HEADER_HEIGHT}>
        {item.months.map(m => (
          <View key={m.key}>
            {renderHeader(m.header)}
            <Group open={m.open} rows={m.rows} estimate={m.rows.length * ROW_HEIGHT} renderRow={renderRow} />
          </View>
        ))}
      </Collapsible>
    );
  }, [renderRow, renderHeader, rangeSettled]);

  const empty = (
    <View className="items-center justify-center py-14 px-4">
      <Text className="text-base text-center" style={{ color: textColor(light).tertiary }}>
        No Transaction yet
      </Text>
      <Text className="text-base mt-1" style={{ color: textColor(light).disabled }}>Tap + to add Transactions</Text>
    </View>
  );

  // Each range's list sits above the one before it (see the wrapper below).
  const layerRef = useRef(0);
  const layerRange = useRef(timeRange);
  if (layerRange.current !== timeRange) { layerRange.current = timeRange; layerRef.current += 1; }

  return (
    <Pressable onPress={closeOpenRow} style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {/* Keyed by the range, so changing it replaces the whole list as one piece:
            the old one fades out as the new one fades in over it. A fresh list also mounts its
            first screenful in a single commit (see initialNumToRender), so the rows
            arrive together instead of filling in one after another, and it starts
            at the top, where a new range should start. */}
        <Animated.View
          key={timeRange}
          // Stacked above the list it replaces, and painted the same colour as the
          // screen behind it.
          style={{ flex: 1, backgroundColor: cardColor, zIndex: layerRef.current }}
          entering={rangeEntering}
          exiting={rangeExiting}
        >
          <FlatList
            data={flatData}
            keyExtractor={item => item.key}
            renderItem={renderItem}
            ListEmptyComponent={empty}
            onScrollBeginDrag={closeOpenRow}
            contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: 8, paddingBottom: FAB_CLEARANCE }}
            showsVerticalScrollIndicator={false}
            style={{ flex: 1 }}
            // Tuned down from the defaults (10/21) — each row's real cost is
            // its ReanimatedSwipeable, not its plain-text content, so keeping
            // fewer of them mounted at once (a smaller window either side of
            // what's on screen) matters more here than it would for a row of
            // pure text.
            // A full screen of rows and a little more, all in the first commit.
            initialNumToRender={16}
            maxToRenderPerBatch={10}
            windowSize={9}
          />
        </Animated.View>
      </View>
    </Pressable>
  );
}

export default memo(forwardRef(TransactionList));
