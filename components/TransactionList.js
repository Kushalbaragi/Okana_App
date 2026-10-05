import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, InteractionManager } from 'react-native';
import Animated, { withTiming } from 'react-native-reanimated';
import { parseISO } from 'date-fns';
import TransactionItem from './TransactionItem';
import { ChevronRight } from './icons';
import { formatCurrency, formatCurrencyPlain } from '../utils/format';
import { textColor, INCOME_TEXT } from '../utils/colors';
import { BODY, TABULAR } from '../utils/type';
import { GUTTER, LEDGER_PILL_INSET } from '../utils/spacing';
import { MONTH_NAMES } from '../utils/monthlyRecap';
import { SETTLE_EASING, SPRING_SMOOTH, layoutTransition } from '../utils/motion';

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

// The space between the last row of an open month and the next month's header.
const MONTH_GAP = 32;

// How long the tour's demo swipe holds the delete button in view before closing,
// and how long the row rests shut before it swipes again.
const DEMO_SWIPE_HOLD_MS = 1300;
const DEMO_SWIPE_PAUSE_MS = 1100;

// How wide one character of a row's amount is, at the body size. The amounts are
// plain digits (no commas) in tabular figures, so every character is the same
// width and a column as wide as the longest amount lines up the dashes after them.
const AMOUNT_CHAR_WIDTH = 10;
// A month's total is written with grouping commas ("₹12,000"), which are narrower
// than a digit, so it is measured a character at a time.
function totalColumnWidth(text) {
  let width = 0;
  for (const ch of text) width += /[0-9₹]/.test(ch) ? AMOUNT_CHAR_WIDTH : AMOUNT_CHAR_WIDTH / 2;
  return width;
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
function MonthHeader({ label, amount, amountWidth, light, isOpen, isIncome, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}, ${isOpen ? 'expanded' : 'collapsed'}`}>
      {/* Laid out like a transaction row: the month's total on the left, in a
          column as wide as the widest total so every month name starts at the
          same place, a dash, then the month. A hairline above separates it from
          whatever is above — the last month's rows, or the month before. No
          card behind it. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: LEDGER_PILL_INSET,
          paddingVertical: 14,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: light ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)',
        }}
      >
        {amount != null && (
          <>
            <Text numberOfLines={1} style={[BODY, TABULAR, { width: amountWidth, color: isIncome ? INCOME_TEXT : textColor(light).secondary }]}>{formatCurrency(amount)}</Text>
            <Text style={[BODY, { marginLeft: 8, marginRight: 18, color: textColor(light).secondary }]}>–</Text>
          </>
        )}
        <Text numberOfLines={1} style={[BODY, { flex: 1, color: textColor(light).secondary }]}>{label}</Text>
        <ChevronRight size={16} color={textColor(light).secondary} />
      </View>
    </Pressable>
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
  const flatData = useMemo(() => {
    const out = [];
    for (const g of groups) {
      const isCurrent = g.key === currentMonthKey;
      // Room before a month's header whenever the rows of an open month sit right
      // above it (the current month's, or one the user expanded), so one month
      // visibly ends before the next begins.
      if (!isCurrent && out.length > 0 && out[out.length - 1].type === 'tx') {
        out.push({ type: 'gap', key: `gap-${g.key}` });
      }
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
        for (const { tx } of g.items) out.push({ type: 'tx', key: tx.id, tx });
      }
    }
    return out;
  }, [groups, currentMonthKey, expandedKey, mode]);

  firstTxIdRef.current = flatData.find(item => item.type === 'tx')?.key ?? null;

  // As wide as the widest month total, so the month names line up.
  const headerAmountWidth = useMemo(
    () => flatData.reduce((max, item) => (item.type === 'header' && item.amount != null ? Math.max(max, totalColumnWidth(formatCurrency(item.amount))) : max), 0),
    [flatData],
  );

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
  // As wide as the longest amount in the list, so each row's dash sits in one
  // vertical line whatever the amounts are.
  const amountWidth = useMemo(
    () => transactions.reduce((max, tx) => Math.max(max, formatCurrencyPlain(tx.amount).length), 1) * AMOUNT_CHAR_WIDTH,
    [transactions],
  );

  const renderTransaction = useCallback((item) => (
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
        amountWidth={amountWidth}
      />
    </Animated.View>
  ), [settled, justAddedId, cardColor, onEdit, onDelete, registerSwipeable, onSwipeOpen, onCardPress, light, amountWidth]);

  const renderItem = useCallback(({ item }) => {
    if (item.type === 'gap') return <View style={{ height: MONTH_GAP }} />;
    if (item.type === 'header') {
      return (
        <MonthHeader
          label={item.label}
          amount={item.amount}
          amountWidth={headerAmountWidth}
          light={light}
          isOpen={item.isOpen}
          isIncome={mode === 'income'}
          onPress={() => toggleMonth(item.groupKey)}
        />
      );
    }
    return renderTransaction(item.tx);
  }, [renderTransaction, light, toggleMonth, mode, headerAmountWidth]);

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
      <View style={{ flex: 1 }}>
        <FlatList
          data={flatData}
          keyExtractor={item => item.key}
          renderItem={renderItem}
          ListEmptyComponent={empty}
          onScrollBeginDrag={closeOpenRow}
          contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: 16, paddingBottom: 112 }}
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
