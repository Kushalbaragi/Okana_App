import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, Pressable, InteractionManager, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { parseISO } from 'date-fns';
import TransactionItem from './TransactionItem';
import { formatCurrency } from '../utils/format';
import { textColor } from '../utils/colors';
import { BODY, TABULAR } from '../utils/type';
import { GUTTER, LEDGER_PILL_INSET } from '../utils/spacing';
import { MONTH_NAMES } from '../utils/monthlyRecap';
import { SETTLE_EASING, SPRING_SMOOTH, layoutTransition } from '../utils/motion';
import { ChevronRight } from './icons';

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

// Per-row stagger on the very first paint, capped so a long history doesn't
// take forever to finish revealing — rows past the cap all settle together
// at the tail instead of queuing further out.
const REVEAL_STAGGER_MS = 40;
const REVEAL_STAGGER_CAP_MS = 420;
// Only the top rows that are plausibly visible without scrolling get the
// animated wrapper at all.
const REVEAL_ANIMATE_MAX = 6;

// How long the tour's demo swipe holds the delete button in view before closing.
const DEMO_SWIPE_HOLD_MS = 1300;

// Slides up + fades in on mount. Only ever plays for the list's very first
// paint (see `revealing` below) — later adds/edits/deletes don't replay it,
// since re-animating every row on every change would be real per-row
// Reanimated setup cost for no visible benefit past the first paint.
function RevealRow({ index, children }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(Math.min(index * REVEAL_STAGGER_MS, REVEAL_STAGGER_CAP_MS), withTiming(1, { duration: 300, easing: SETTLE_EASING }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 14 }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

// One running ledger — every month that has anything in it, newest first,
// each with a total; every transaction under its own month, newest first.
//
// The current month has no header at all any more — see flatData's own
// comment on why. Every OTHER month is collapsed by default behind this
// header (its total stays, since nowhere else on screen says it) and opens
// on tap — the `total` this list shows was never a drill-down destination,
// just a summary, so there's nothing lost by not unrolling every month at
// once.
//
// `amount` follows whichever tab the Home chart is on: Expense shows the
// month's expense total, Income its income total, Overview shows nothing
// (see TransactionList's own comment on why Overview has no single figure
// that means anything here) — `amount == null` is what skips it below.
function MonthHeader({ label, amount, light, isOpen, onPress }) {
  return (
    <>
      {/* A true hairline (device pixel, not a logical point) above every
          header — the same divider convention SettingsUI/SavingsSection
          already use elsewhere, just inset to the ledger's own margin
          rather than theirs. Sits outside the Pressable so it's just a
          line, not part of the tappable row's own visual feedback.
          No margin of its own on purpose — the row below carries equal
          padding top and bottom (see paddingVertical there), which is what
          actually centres its content between this line and the next one;
          if this divider added its own extra margin on one side, the text
          would sit closer to whichever line that margin was next to. */}
      <View
        style={{
          height: StyleSheet.hairlineWidth,
          marginHorizontal: LEDGER_PILL_INSET,
          backgroundColor: light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
        }}
      />
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}, ${isOpen ? 'expanded' : 'collapsed'}`}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: LEDGER_PILL_INSET,
            paddingVertical: 14,
          }}
        >
          {/* No card background any more — several of these stacked back to
              back (a few consecutive collapsed months) read as a wall of
              identical dark blocks, clashing with how plain the current
              month's own rows are just above them. A plain row matches that
              same language instead of looking like a different component
              bolted onto the same list. Label/total stay bright, dash dim —
              same hierarchy as before, just without the box around it. */}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[BODY, { color: textColor(light).primary }]}>{label}</Text>
            {amount != null && (
              <>
                <Text style={[BODY, { color: textColor(light).disabled, marginHorizontal: 12 }]}>—</Text>
                <Text style={[BODY, TABULAR, { color: textColor(light).primary }]}>{formatCurrency(amount)}</Text>
              </>
            )}
          </View>

          {/* Rotates between pointing right (collapsed) and down (open) —
              same treatment SavingsSection's own "Completed" toggle already
              uses. */}
          <View style={{ transform: [{ rotate: isOpen ? '90deg' : '0deg' }] }}>
            <ChevronRight color={light ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)'} />
          </View>
        </View>
      </Pressable>
    </>
  );
}

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
  // Handed the element the rows sit inside, for a caller that wants to
  // point at it (the tour outlines it).
  cardRef,
  // Same Expense/Income/Overview value the Home chart's slider is on —
  // decides which figure (if any) each month's header shows, see
  // MonthHeader's own comment.
  mode = 'expense',
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

  const closeOpenRow = useCallback(() => {
    const id = openIdRef.current;
    if (id) swipeRefs.current.get(id)?.close();
    openIdRef.current = null;
  }, []);

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

  // Slides the first row open to show its delete button, holds a moment, and
  // slides it shut — the tour uses it to show what swiping a transaction does.
  // Says whether there was a row to do it on (rows only become swipeable a moment
  // after a list paints, so the first try can find none).
  const demoTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(demoTimerRef.current), []);
  const demoSwipe = useCallback(() => {
    const first = swipeRefs.current.entries().next();
    if (first.done) return false;
    const [id, swipeable] = first.value;
    swipeable.openRight();
    openIdRef.current = id;
    clearTimeout(demoTimerRef.current);
    demoTimerRef.current = setTimeout(() => {
      swipeable.close();
      if (openIdRef.current === id) openIdRef.current = null;
    }, DEMO_SWIPE_HOLD_MS);
    return true;
  }, []);

  useImperativeHandle(ref, () => ({ closeOpenRow, demoSwipe }), [closeOpenRow, demoSwipe]);

  // The current month is always expanded — it's the one someone opens the
  // app to check today. Every other month starts collapsed behind its
  // header and only unrolls on tap; at most one at a time (opening a new
  // one closes whatever was open), so the ledger stays a single screen of
  // headers rather than growing into the old page-long scroll again.
  const now = useRef(new Date()).current;
  const currentMonthKey = now.getFullYear() * 12 + now.getMonth();
  const [expandedKey, setExpandedKey] = useState(null);
  const toggleMonth = useCallback(key => {
    setExpandedKey(k => (k === key ? null : key));
  }, []);

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

  // Flattened into one array — a header entry, then that month's
  // transactions, then the next month's header, and so on — because FlatList
  // (unlike the plain ScrollView this used to be) needs one flat `data` to
  // virtualize over. That virtualization is the whole reason for this shape:
  // a personal ledger open for a while runs to hundreds of rows, each one a
  // real ReanimatedSwipeable (gesture-handler + worklet setup) once `settled`
  // arms them — mounting every single one at once, as the old ScrollView
  // did, is what made scrolling janky. FlatList only ever mounts what's on
  // screen plus a small buffer.
  //
  // `revealIndex` only counts transaction rows (not headers), since
  // REVEAL_ANIMATE_MAX is about how many rows are plausibly visible on the
  // first paint, not position within the flattened array.
  const flatData = useMemo(() => {
    const out = [];
    let revealIndex = 0;
    for (const g of groups) {
      const isCurrent = g.key === currentMonthKey;
      const isOpen = isCurrent || g.key === expandedKey;
      // No header at all for the current month — everything it would have
      // said (the month name, the amount) is already on screen three other
      // ways above the list (the period caption, the page dots, the chart's
      // own label), and it wasn't tappable like the past-month pills below
      // it, just pill-shaped chrome around nothing.
      if (!isCurrent) {
        out.push({
          type: 'header',
          key: `h-${g.key}`,
          groupKey: g.key,
          label: `${MONTH_NAMES[g.month].slice(0, 3).toUpperCase()}-${g.year}`,
          // Overview shows neither figure — expense-only and income-only
          // are each an answer to "what happened", but there's no single
          // net number this list has ever meant to show (see the chart's
          // own expense-only convention this used to just inherit).
          amount: mode === 'income' ? g.incomeTotal : mode === 'expense' ? g.expenseTotal : null,
          isOpen,
        });
      }
      if (isOpen) {
        for (const { tx } of g.items) {
          out.push({ type: 'tx', key: tx.id, tx, revealIndex: revealIndex++ });
        }
      }
    }
    return out;
  }, [groups, currentMonthKey, expandedKey, mode]);

  // True only while the list's very first paint is still revealing. This is
  // state rather than a ref-flipped-on-mount deliberately: `settled` below
  // forces a re-render a frame or two after that first paint, and a ref
  // that had already flipped would drop RevealRow's wrapper mid-animation,
  // popping the rows into place. Held for the reveal's full duration
  // instead, then flipped once — after which nothing mounts a RevealRow
  // again, even as more transactions are added later.
  const [revealing, setRevealing] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setRevealing(false), REVEAL_STAGGER_CAP_MS + 300);
    return () => clearTimeout(t);
  }, []);

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
  const renderTransaction = useCallback((item, revealIndex) => {
    const card = (
      <Animated.View
        layout={settled ? ROW_LAYOUT_TRANSITION : undefined}
        entering={item.id === justAddedId ? rowEntering : undefined}
        style={{ backgroundColor: cardColor }}
      >
        <TransactionItem
          tx={item}
          isIncome={item.type === 'income'}
          onEdit={onEdit}
          onDelete={onDelete}
          registerSwipeable={registerSwipeable}
          onSwipeOpen={onSwipeOpen}
          onCardPress={onCardPress}
          light={light}
          cardColor={cardColor}
          swipeable={settled}
        />
      </Animated.View>
    );
    const shouldAnimate = revealing && revealIndex < REVEAL_ANIMATE_MAX;
    return shouldAnimate ? <RevealRow index={revealIndex}>{card}</RevealRow> : card;
  }, [settled, revealing, justAddedId, cardColor, onEdit, onDelete, registerSwipeable, onSwipeOpen, onCardPress, light]);

  const renderItem = useCallback(({ item }) => (
    item.type === 'header'
      ? (
        <MonthHeader
          label={item.label}
          amount={item.amount}
          light={light}
          isOpen={item.isOpen}
          onPress={() => toggleMonth(item.groupKey)}
        />
      )
      : renderTransaction(item.tx, item.revealIndex)
  ), [renderTransaction, light, toggleMonth]);

  const empty = (
    <View className="items-center justify-center py-14 px-4">
      <Text className="text-base text-center" style={{ color: textColor(light).tertiary }}>
        No Transaction yet
      </Text>
      <Text className="text-base mt-1" style={{ color: textColor(light).disabled }}>Tap + to add Transactions</Text>
    </View>
  );

  return (
    <Pressable onPress={closeOpenRow} style={{ flex: 1 }}>
      {/* ref sits on this wrapper, not the FlatList itself — FlatList's own
          ref isn't a plain measurable host view, and the tour only needs
          something spanning the same area to outline. */}
      <View ref={cardRef} style={{ flex: 1 }}>
        <FlatList
          data={flatData}
          keyExtractor={item => item.key}
          renderItem={renderItem}
          ListEmptyComponent={empty}
          onScrollBeginDrag={closeOpenRow}
          contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: 112 }}
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
          // Tuned down from the defaults (10/21) — each row's real cost is
          // its ReanimatedSwipeable, not its plain-text content, so keeping
          // fewer of them mounted at once (a smaller window either side of
          // what's on screen) matters more here than it would for a row of
          // pure text.
          initialNumToRender={14}
          maxToRenderPerBatch={10}
          windowSize={9}
        />
      </View>
    </Pressable>
  );
}

export default memo(forwardRef(TransactionList));
