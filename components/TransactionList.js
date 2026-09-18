import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, Pressable, InteractionManager, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withTiming, LinearTransition, SlideInRight, SlideInLeft, FadeIn } from 'react-native-reanimated';
import { parseISO } from 'date-fns';
import TransactionItem from './TransactionItem';
import { formatCurrency } from '../utils/format';
import { MONTH_NAMES } from '../utils/monthlyRecap';
import { CARD_COLOR } from './Glass';
import { ChevronRight, BackIcon } from './icons';
import { SETTLE_EASING } from './AmountField';

// Same spring shape as AmountField's AMOUNT_LAYOUT_TRANSITION (proven
// smooth for this app's other retriggered repositioning), tuned a touch
// slower — a taller list row settling into place reads better a bit more
// gently than a narrow amount digit sliding.
const ROW_LAYOUT_TRANSITION = LinearTransition.springify().damping(22).stiffness(180).mass(0.6);

// Plays once, only for the row TransactionList is told just got added (see
// justAddedId) — a plain fade + small rise, no stagger, since there's only
// ever one of these at a time. Deliberately not reused for every row's
// mount (e.g. a tab switch remounting a whole new filtered set) — that's
// exactly the "real per-row Reanimated setup cost" RevealRow's own comment
// already flags as not worth paying on every switch.
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

// Per-row stagger, capped so a long list doesn't take forever to finish
// revealing — rows past the cap all settle together at the tail instead of
// queuing further out.
const REVEAL_STAGGER_MS = 40;
const REVEAL_STAGGER_CAP_MS = 420;
// Only the top rows that are plausibly visible without scrolling get the
// animated wrapper at all — a phone screen shows a handful of rows below
// the chart, not sixteen.
const REVEAL_ANIMATE_MAX = 6;

// Rounder than the 16 this started at — at that size the corner reads as a
// softened square rather than the continuous curve iOS grouped lists use.
const CARD_RADIUS = 24;
// Lines the divider up with the description text rather than the card edge:
// the row's own horizontal padding (16) + the date box (32) + its right
// margin (10). Keep in step with TransactionItem's px-4 / w-8 / mr-2.5.
const DIVIDER_INSET = 58;
// Drill rows have no date box, so their divider starts at the row's own
// padding instead — still aligned with where that row's label begins.
const DRILL_DIVIDER_INSET = 16;

// How long a step deeper (or back out) takes to slide across.
const NAV_SLIDE_MS = 260;
// Shorter than the slide — a tab switch should feel immediate, and the
// content underneath has already been replaced by the time it plays.
const TAB_FADE_MS = 190;

// Slides up + fades in on mount. Only ever plays for the list's very first
// paint (see `revealing` in TransactionList) — switching tabs/periods
// just swaps content in directly, no replay, since re-animating every
// switch was real per-row Reanimated setup cost on top of the re-filter.
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

// Corner radii are per-row rather than on a shared wrapper, so the stack of
// rows reads as one card while each row stays its own independently
// virtualized cell. Same approach the transaction rows use.
function cardShape(isFirst, isLast, cardColor) {
  return {
    backgroundColor: cardColor,
    overflow: 'hidden',
    borderTopLeftRadius: isFirst ? CARD_RADIUS : 0,
    borderTopRightRadius: isFirst ? CARD_RADIUS : 0,
    borderBottomLeftRadius: isLast ? CARD_RADIUS : 0,
    borderBottomRightRadius: isLast ? CARD_RADIUS : 0,
  };
}

// Same size, radius and tint as TransactionItem's own DateBox, so a month's
// leading marker reads as part of the same family as the date chip on the
// transactions one level down — and lands at the same x, which is why a
// month row can share their divider inset exactly.
function MonthBox({ n, light }) {
  return (
    <View
      className="items-center justify-center w-8 h-8 rounded shrink-0 mr-2.5"
      style={{ backgroundColor: light ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)' }}
    >
      <Text className="text-[13px] font-semibold" style={{ color: light ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)' }}>
        {n}
      </Text>
    </View>
  );
}

// One step in the hierarchy — a year in All Time, or a month inside a year.
// Deliberately the same shape as a transaction row (same type scale,
// padding, card corners, divider treatment) so drilling in doesn't feel
// like moving between two differently-designed lists. The chevron is the
// only thing marking it as a step rather than a leaf.
function DrillRow({ label, total, leading, dividerInset, isFirst, isLast, cardColor, dividerColor, light, amountColor, onPress }) {
  return (
    <View style={cardShape(isFirst, isLast, cardColor)}>
      <Pressable
        onPress={onPress}
        className="flex-row items-center justify-between py-4 px-4"
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <View className="flex-row items-center flex-1 pr-3">
          {leading}
          <Text className="text-base" style={{ color: light ? '#111111' : '#ffffff' }}>{label}</Text>
        </View>

        <View className="flex-row items-center shrink-0" style={{ gap: 6 }}>
          <Text className="text-base font-medium" style={{ color: amountColor }}>{formatCurrency(total)}</Text>
          <ChevronRight color={light ? 'rgba(0,0,0,0.25)' : undefined} />
        </View>
      </Pressable>
      {!isLast && (
        <View style={{ height: StyleSheet.hairlineWidth, marginLeft: dividerInset, backgroundColor: dividerColor }} />
      )}
    </View>
  );
}

// At the root of a view this is just the section label the list always had.
// One level deeper it becomes the Back control, with where-you-are on the
// right — one row doing both jobs rather than stacking a breadcrumb above
// the label.
function ListHeader({ backLabel, currentLabel, onBack, light }) {
  const labelColor = light ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.25)';
  if (!onBack) {
    return (
      // No px-1 — the card below doesn't have it, so the 4px put this label
      // out of line with the card edge. The list's own paddingHorizontal is
      // the only inset it should get.
      <Text className="text-sm font-medium uppercase tracking-wide mt-4 mb-3" style={{ color: labelColor }}>
        Transactions
      </Text>
    );
  }
  return (
    <View className="flex-row items-center justify-between mt-4 mb-3">
      <Pressable
        onPress={onBack}
        hitSlop={10}
        className="flex-row items-center"
        accessibilityRole="button"
        accessibilityLabel={`Back to ${backLabel}`}
      >
        <BackIcon size={15} color={light ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)'} />
        <Text
          className="text-sm font-medium uppercase tracking-wide ml-1"
          style={{ color: light ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)' }}
        >
          {backLabel}
        </Text>
      </Pressable>
      <Text className="text-sm font-medium uppercase tracking-wide" style={{ color: labelColor }}>
        {currentLabel}
      </Text>
    </View>
  );
}

// `light` is a one-off experimental prop for trying a light theme on just
// the Dashboard — see the matching comment in Header.js.
function TransactionList({
  transactions,
  activeTab,
  chartTab   = 'expense',
  selectedMonth,
  year,
  timeRange  = 'year',
  selectedPeriod,
  selectedDay,
  onEdit,
  onDelete,
  light = false,
  // Id of a transaction that was just added — that one row plays
  // rowEntering (fade + rise) and everything below it pushes down via
  // ROW_LAYOUT_TRANSITION. Every other row's mount (e.g. a tab switch's
  // full re-filter) stays exactly as cheap as before — see rowEntering's
  // own comment.
  justAddedId,
}, ref) {
  // The raised surface the rows sit on. This used to be the same colour as
  // the page behind it, which meant the per-row corner radii had nothing to
  // show against and the list read as loose text rather than a card.
  const cardColor = light ? '#FFFFFF' : CARD_COLOR;
  const dividerColor = light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
  const isOverview = chartTab === 'overview';
  const isIncome   = activeTab === 'income';

  // Coordinates "only one swiped-open row at a time" across the whole list —
  // refs rather than state, since none of this should ever trigger a
  // re-render of its own.
  const swipeRefs = useRef(new Map());
  const openIdRef = useRef(null);

  const registerSwipeable = useCallback((id, ref) => {
    if (ref) swipeRefs.current.set(id, ref);
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

  // Exposed so the screen this list lives on can close an open swipe when
  // the user taps something entirely outside this component — the chart's
  // Expense/Income/Overview tabs, the month/year/All Time pills, the header
  // — none of which are descendants of TransactionList.
  useImperativeHandle(ref, () => ({ closeOpenRow }), [closeOpenRow]);

  // ---------------------------------------------------------------------
  // Hierarchy
  //
  // Years of history is far too much to reach by scrolling, so Year and All
  // Time no longer render every transaction at once. They render the level
  // above instead, and drill down a step at a time:
  //
  //   Month     -> transactions                    (unchanged)
  //   Year      -> months -> transactions
  //   All Time  -> years  -> months -> transactions
  //
  // `drill` is local state on purpose. It's a browsing position, not a data
  // selection: moving through it must not change what the chart above is
  // showing, which is what would happen if it were lifted into the screen's
  // own selectedMonth/selectedPeriod.
  // ---------------------------------------------------------------------
  const [drill, setDrill] = useState({ year: null, month: null });
  // What kind of move produced the level currently on screen, which decides
  // how it arrives: a step through the hierarchy slides in the direction of
  // travel, a tab/range switch crossfades (it's a change of subject, not a
  // move through anything), and the very first paint does neither.
  const [navMode, setNavMode] = useState('none');

  // Switching tab or range starts a new browse from the top, rather than
  // stranding the user at a depth that belonged to the previous view.
  const contextKey = `${timeRange}|${activeTab}|${isOverview}|${year}`;
  const [prevContextKey, setPrevContextKey] = useState(contextKey);
  if (contextKey !== prevContextKey) {
    setPrevContextKey(contextKey);
    setDrill({ year: null, month: null });
    setNavMode('switch');
  }

  // Tapping a point on the Overview curve still filters this list — it just
  // expresses itself as a jump to that depth now. Keyed on the selection's
  // value, not fired on every render, so pressing Back can't be instantly
  // undone by a selection that is merely still set.
  const lastSyncedSelRef = useRef(null);
  useEffect(() => {
    const sel =
      timeRange === 'year' && selectedMonth != null ? `y:${year}-${selectedMonth}` :
      timeRange === '5y' && selectedPeriod != null ? `p:${selectedPeriod.year}-${selectedPeriod.month ?? ''}` :
      null;
    if (sel === lastSyncedSelRef.current) return;
    lastSyncedSelRef.current = sel;
    if (!sel) return;
    setNavMode('deeper');
    if (timeRange === 'year') setDrill({ year, month: selectedMonth });
    else setDrill({ year: selectedPeriod.year, month: selectedPeriod.month ?? null });
  }, [timeRange, selectedMonth, selectedPeriod, year]);

  const level =
    timeRange === 'month' ? 'transactions' :
    timeRange === 'year' ? (drill.month == null ? 'months' : 'transactions') :
    drill.year == null ? 'years' : drill.month == null ? 'months' : 'transactions';

  // Year view's year is fixed by the range selector; All Time's comes from
  // whichever year was drilled into.
  const scopeYear = timeRange === 'year' ? year : drill.year;

  const openYear = useCallback(y => { setNavMode('deeper'); setDrill({ year: y, month: null }); }, []);
  const openMonth = useCallback(m => { setNavMode('deeper'); setDrill(d => ({ ...d, month: m })); }, []);
  const goBack = useCallback(() => {
    closeOpenRow();
    setNavMode('back');
    setDrill(d => (d.month != null ? { ...d, month: null } : { year: null, month: null }));
  }, [closeOpenRow]);

  // Every year/month that actually has something in it, with its total, in
  // one pass. Only populated levels are ever listed — an empty month is a
  // dead end the user shouldn't be able to tap into.
  const buckets = useMemo(() => {
    const years = new Map();
    for (const tx of transactions) {
      if (!isOverview && tx.type !== activeTab) continue;
      // parseISO, not `new Date(tx.date)` — tx.date is a plain "YYYY-MM-DD",
      // and the native constructor parses a date-only string as UTC midnight
      // rather than local midnight, which can shift the month or year it
      // lands in depending on timezone. See shiftDate in utils/format.js.
      const d = parseISO(tx.date);
      const y = d.getFullYear();
      const m = d.getMonth();
      // Overview lists both types, so its total is the net; a single-type
      // tab just accumulates that type.
      const signed = isOverview ? (tx.type === 'income' ? tx.amount : -tx.amount) : tx.amount;

      let yb = years.get(y);
      if (!yb) { yb = { year: y, total: 0, months: new Map() }; years.set(y, yb); }
      yb.total += signed;

      let mb = yb.months.get(m);
      if (!mb) { mb = { month: m, total: 0 }; yb.months.set(m, mb); }
      mb.total += signed;
    }
    return years;
  }, [transactions, activeTab, isOverview]);

  // Newest first, matching how transactions themselves are ordered and how
  // the month sections used to be — the most recent period is the one being
  // looked for most often, and for the current year it's the only one with
  // anything in it yet.
  const yearRows = useMemo(
    () => [...buckets.values()].sort((a, b) => b.year - a.year),
    [buckets],
  );
  const monthRows = useMemo(
    () => [...(buckets.get(scopeYear)?.months.values() ?? [])].sort((a, b) => b.month - a.month),
    [buckets, scopeYear],
  );

  // One flat list now, never sectioned: every path through the hierarchy
  // ends inside a single month, so there is nothing left to group by.
  const items = useMemo(() => {
    if (level !== 'transactions') return [];

    function matches(tx, d) {
      if (!isOverview && tx.type !== activeTab) return false;
      if (timeRange === 'month') {
        if (d.getFullYear() !== year || d.getMonth() !== selectedMonth) return false;
        return selectedDay == null || d.getDate() === selectedDay;
      }
      return d.getFullYear() === scopeYear && d.getMonth() === drill.month;
    }

    const rows = [];
    for (const tx of transactions) {
      const d = parseISO(tx.date);
      if (!matches(tx, d)) continue;
      rows.push({ tx, ts: d.getTime(), cts: new Date(tx.createdAt).getTime() });
    }
    rows.sort((a, b) => b.ts - a.ts || b.cts - a.cts);
    return rows.map(r => r.tx);
  }, [level, transactions, activeTab, isOverview, timeRange, year, selectedMonth, selectedDay, scopeYear, drill.month]);

  // True only while the list's very first paint is still revealing. This is
  // state rather than a ref-flipped-on-mount deliberately: `settled` below
  // forces a re-render a frame or two after that first paint, and a ref
  // that had already flipped would drop RevealRow's wrapper mid-animation,
  // popping the rows into place. Held for the reveal's full duration
  // instead, then flipped once — after which no switch ever mounts a
  // RevealRow again.
  const [revealing, setRevealing] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setRevealing(false), REVEAL_STAGGER_CAP_MS + 300);
    return () => clearTimeout(t);
  }, []);

  // Everything that makes a switch a *switch* — a whole new filtered set,
  // every visible row unmounting and a new one mounting. Drilling counts:
  // it swaps the entire list contents just like a tab change does.
  // Deliberately not including `transactions`: adding or deleting a row
  // isn't a switch, and shouldn't cost that row its entrance animation.
  const filterKey = `${activeTab}|${isOverview}|${timeRange}|${year}|${selectedMonth}|${selectedDay}|${drill.year}|${drill.month}`;

  // False for the first commit after a switch, true once that commit has
  // settled. Gates the two per-row costs that profiling showed dominate a
  // switch — ReanimatedSwipeable's gesture/worklet setup and the layout
  // transition — so the rows paint immediately and the animation machinery
  // arrives a frame or two later, off the critical path. Once true it stays
  // true until the next switch, so a later add/delete still animates
  // normally.
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  const [settled, setSettled] = useState(false);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setSettled(false);
  }
  useEffect(() => {
    if (settled) return undefined;
    const handle = InteractionManager.runAfterInteractions(() => setSettled(true));
    return () => handle.cancel();
  }, [settled, filterKey]);

  // Hoisted out of the list's props. Inline arrows were recreated on every
  // render, which meant VirtualizedList's CellRenderer could never bail out
  // of a cell and memo(TransactionItem) never got a chance to do its job.
  const renderTransaction = useCallback(({ item, index }) => {
    const isLast = index === items.length - 1;
    const card = (
      <Animated.View
        layout={settled ? ROW_LAYOUT_TRANSITION : undefined}
        entering={item.id === justAddedId ? rowEntering : undefined}
        style={cardShape(index === 0, isLast, cardColor)}
      >
        <TransactionItem
          tx={item}
          isIncome={isOverview ? item.type === 'income' : isIncome}
          onEdit={onEdit}
          onDelete={onDelete}
          registerSwipeable={registerSwipeable}
          onSwipeOpen={onSwipeOpen}
          onCardPress={onCardPress}
          light={light}
          cardColor={cardColor}
          swipeable={settled}
        />
        {/* Sibling of the swipeable, not a child of it, so it stays put while
            a row is dragged open — the divider belongs to the card, not to
            the row's sliding content. Inset to start where the label does
            rather than running the full width. */}
        {!isLast && (
          <View style={{ height: StyleSheet.hairlineWidth, marginLeft: DIVIDER_INSET, backgroundColor: dividerColor }} />
        )}
      </Animated.View>
    );
    // Only the first paint's top rows animate — once `revealing` flips,
    // every later render, for any reason, just shows the card directly.
    const shouldAnimate = revealing && index < REVEAL_ANIMATE_MAX;
    return shouldAnimate ? <RevealRow index={index}>{card}</RevealRow> : card;
  }, [items.length, settled, revealing, justAddedId, cardColor, dividerColor, isOverview, isIncome, onEdit, onDelete, registerSwipeable, onSwipeOpen, onCardPress, light]);

  const drillAmountColor = isIncome && !isOverview
    ? 'rgba(74,222,128,0.8)'
    : light ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)';

  const renderYear = useCallback(({ item, index }) => (
    <DrillRow
      label={String(item.year)}
      total={Math.abs(item.total)}
      // No leading marker — a year row's label is already the number, so a
      // chip beside it would just be the same information twice.
      dividerInset={DRILL_DIVIDER_INSET}
      isFirst={index === 0}
      isLast={index === yearRows.length - 1}
      cardColor={cardColor}
      dividerColor={dividerColor}
      light={light}
      amountColor={drillAmountColor}
      onPress={() => openYear(item.year)}
    />
  ), [yearRows.length, cardColor, dividerColor, light, drillAmountColor, openYear]);

  const renderMonth = useCallback(({ item, index }) => (
    <DrillRow
      label={MONTH_NAMES[item.month]}
      total={Math.abs(item.total)}
      leading={<MonthBox n={item.month + 1} light={light} />}
      // Matches the transaction rows' inset exactly — MonthBox is the same
      // width and margin as their DateBox, so the dividers line up straight
      // through a drill-in.
      dividerInset={DIVIDER_INSET}
      isFirst={index === 0}
      isLast={index === monthRows.length - 1}
      cardColor={cardColor}
      dividerColor={dividerColor}
      light={light}
      amountColor={drillAmountColor}
      onPress={() => openMonth(item.month)}
    />
  ), [monthRows.length, cardColor, dividerColor, light, drillAmountColor, openMonth]);

  // Back goes up exactly one level, and says where it lands rather than just
  // "Back" — at the transactions level that's the year you came from, one
  // step up in All Time it's the range itself.
  const canGoBack =
    (timeRange === 'year' && level === 'transactions') ||
    (timeRange === '5y' && level !== 'years');
  const backLabel = level === 'transactions' ? String(scopeYear) : 'All Time';
  const currentLabel = level === 'transactions' ? MONTH_NAMES[drill.month] : String(drill.year);

  const header = (
    <ListHeader
      backLabel={backLabel}
      currentLabel={currentLabel}
      onBack={canGoBack ? goBack : null}
      light={light}
    />
  );

  // Keyed per level AND per position within it, so each step in or out
  // mounts a fresh view and plays the slide. Nothing slides on the first
  // paint — see navMode. The context is part of the key, not just the
  // depth, so switching Expense/Income/Overview (or the range) remounts
  // this too and gets its own crossfade, rather than silently swapping the
  // rows underneath a view that never changed identity.
  const levelKey = `${contextKey}|${level}|${drill.year ?? ''}|${drill.month ?? ''}`;
  const entering =
    navMode === 'deeper' ? SlideInRight.duration(NAV_SLIDE_MS) :
    navMode === 'back' ? SlideInLeft.duration(NAV_SLIDE_MS) :
    navMode === 'switch' ? FadeIn.duration(TAB_FADE_MS) :
    undefined;

  // The header sits OUTSIDE the animated wrapper below, not in the lists as
  // a ListHeaderComponent. Only the card's contents should travel on a
  // drill-in; sliding the section label and the Back control along with
  // them made the whole panel look like it was being replaced, rather than
  // one level handing off to the next underneath a heading that stays put.
  // It also keeps Back fixed in place instead of scrolling away.
  const listProps = {
    onScrollBeginDrag: closeOpenRow,
    contentContainerStyle: { paddingHorizontal: 16, paddingBottom: 112 },
    showsVerticalScrollIndicator: false,
    style: { flex: 1 },
  };

  let body;
  if (level === 'years' || level === 'months') {
    const data = level === 'years' ? yearRows : monthRows;
    body = (
      <FlatList
        {...listProps}
        data={data}
        keyExtractor={row => String(level === 'years' ? row.year : row.month)}
        renderItem={level === 'years' ? renderYear : renderMonth}
      />
    );
  } else if (items.length === 0) {
    body = (
      <View className="px-4">
        <View className="items-center justify-center py-14 px-4">
          <Text className="text-base text-center" style={{ color: light ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.25)' }}>
            No Transaction yet
          </Text>
          <Text className="text-base mt-1" style={{ color: light ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.15)' }}>Tap + to add Transactions</Text>
        </View>
      </View>
    );
  } else {
    body = (
      <FlatList
        {...listProps}
        data={items}
        keyExtractor={tx => tx.id}
        renderItem={renderTransaction}
        // Six, not twelve — a phone screen shows roughly this many rows
        // below the chart, and every extra one is a full row mount paid
        // synchronously on the switch. The rest stream in via
        // maxToRenderPerBatch as usual.
        initialNumToRender={6}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
      />
    );
  }

  return (
    <Pressable onPress={closeOpenRow} style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16 }}>{header}</View>
      <Animated.View key={levelKey} entering={entering} style={{ flex: 1 }}>
        {body}
      </Animated.View>
    </Pressable>
  );
}

export default memo(forwardRef(TransactionList));
