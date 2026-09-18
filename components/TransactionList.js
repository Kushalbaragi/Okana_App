import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View, Text, SectionList, Pressable, InteractionManager, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withTiming, LinearTransition } from 'react-native-reanimated';
import { parseISO } from 'date-fns';
import TransactionItem from './TransactionItem';
import { monthLabel } from '../utils/format';
import { CARD_COLOR } from './Glass';
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

function ListHeaderFor(light) {
  return (
    // No px-1 — the section headers below don't have it, so the 4px put
    // this label out of line with both them and the card edge underneath.
    // The list's own paddingHorizontal is the only inset either should get.
    <Text
      className="text-sm font-medium uppercase tracking-wide mt-4 mb-3"
      style={{ color: light ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.25)' }}>
      Transactions
    </Text>
  );
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
  // Two distinct colors now, where there used to be one. `bgColor` is the
  // page behind the list; `cardColor` is the raised surface the rows sit on.
  // They were identical before, which meant the per-row corner radii had
  // nothing to show against and the list read as loose text on the page
  // rather than a card.
  const bgColor = light ? '#FAFAF8' : '#000000';
  const cardColor = light ? '#FFFFFF' : CARD_COLOR;
  const dividerColor = light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
  const isOverview = chartTab === 'overview';
  const isIncome   = activeTab === 'income';

  // Coordinates "only one swiped-open row at a time" across the whole list —
  // refs rather than state, since none of this should ever trigger a
  // SectionList re-render of its own.
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

  const shouldGroup = isOverview || timeRange === '5y';

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

  // Filter, sort, and group in one pass instead of three (filter -> map ->
  // sort -> map, then a separate pass over the result to group) — each of
  // those previously re-parsed `new Date(tx.date)` from scratch (up to 3x
  // per transaction total, once here, once for the sort key, once again
  // for the group key), real, avoidable cost that scales with how many
  // transactions a switch pulls in (worst case "All Time", every
  // transaction the account has ever had). One parse per transaction,
  // reused for the filter check, the sort key, and the group key.
  const sections = useMemo(() => {
    function matches(tx, d) {
      if (timeRange === 'month' && selectedDay != null) {
        if (d.getDate() !== selectedDay || d.getMonth() !== selectedMonth || d.getFullYear() !== year) return false;
        if (!isOverview && tx.type !== activeTab) return false;
        return true;
      }
      if (!isOverview && tx.type !== activeTab) return false;
      if (timeRange === '5y') {
        if (selectedPeriod != null) {
          if (selectedPeriod.month != null) return d.getFullYear() === selectedPeriod.year && d.getMonth() === selectedPeriod.month;
          return d.getFullYear() === selectedPeriod.year;
        }
        return true;
      }
      if (timeRange === 'year' && selectedMonth == null) return d.getFullYear() === year;
      return d.getMonth() === selectedMonth && d.getFullYear() === year;
    }

    const items = [];
    for (const tx of transactions) {
      // parseISO, not `new Date(tx.date)` — tx.date is a plain "YYYY-MM-DD",
      // and the native constructor parses a date-only string as UTC
      // midnight rather than local midnight, which can shift getDate()/
      // getMonth()/getFullYear() by a day depending on timezone. See the
      // matching comment on shiftDate in utils/format.js.
      const d = parseISO(tx.date);
      if (!matches(tx, d)) continue;
      items.push({ tx, d, ts: d.getTime(), cts: new Date(tx.createdAt).getTime() });
    }
    items.sort((a, b) => b.ts - a.ts || b.cts - a.cts);

    // Single source of truth for both render paths — SectionList just gets
    // one untitled section when the view isn't grouped, so there's only one
    // rendering strategy (and one set of virtualization knobs) to reason
    // about instead of two diverging FlatList branches.
    if (!shouldGroup) {
      return items.length ? [{ key: 'all', title: null, data: items.map(it => it.tx) }] : [];
    }
    const map = {};
    for (const it of items) {
      const key = `${it.d.getFullYear()}-${String(it.d.getMonth()).padStart(2, '0')}`;
      if (!map[key]) map[key] = { key, title: monthLabel(it.d.getMonth(), it.d.getFullYear()), data: [] };
      map[key].data.push(it.tx);
    }
    return Object.values(map).sort((a, b) => b.key.localeCompare(a.key));
  }, [transactions, activeTab, isOverview, selectedMonth, year, timeRange, selectedPeriod, selectedDay, shouldGroup]);

  // Everything that makes a switch a *switch* — a whole new filtered set,
  // every visible row unmounting and a new one mounting. Deliberately not
  // including `transactions`: adding or deleting a row isn't a switch, and
  // shouldn't cost that row its entrance animation (see `settled`).
  const filterKey = `${activeTab}|${isOverview}|${timeRange}|${year}|${selectedMonth}|${selectedDay}|${selectedPeriod?.year}-${selectedPeriod?.month}`;

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

  // Hoisted out of the SectionList's props. Inline arrows were recreated on
  // every render, which meant VirtualizedList's CellRenderer could never
  // bail out of a cell and memo(TransactionItem) never got a chance to do
  // its job.
  const firstSectionKey = sections[0]?.key;
  const renderItem = useCallback(({ item, index, section }) => {
    const isLast = index === section.data.length - 1;
    const card = (
      <Animated.View
        layout={settled ? ROW_LAYOUT_TRANSITION : undefined}
        entering={item.id === justAddedId ? rowEntering : undefined}
        style={{
          backgroundColor: cardColor,
          overflow: 'hidden',
          borderTopLeftRadius: index === 0 ? CARD_RADIUS : 0,
          borderTopRightRadius: index === 0 ? CARD_RADIUS : 0,
          borderBottomLeftRadius: isLast ? CARD_RADIUS : 0,
          borderBottomRightRadius: isLast ? CARD_RADIUS : 0,
        }}
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
  }, [settled, revealing, justAddedId, cardColor, dividerColor, isOverview, isIncome, onEdit, onDelete, registerSwipeable, onSwipeOpen, onCardPress, light]);

  const renderSectionHeader = useCallback(({ section }) => (
    section.title ? (
      <View
        className={`flex-row items-center justify-between mb-2 ${section.key === firstSectionKey ? 'mt-0' : 'mt-6'}`}
        style={{ backgroundColor: bgColor }}
      >
        <Text className="text-sm font-medium uppercase tracking-wider" style={{ color: light ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.35)' }}>
          {section.title}
        </Text>
      </View>
    ) : null
  ), [firstSectionKey, bgColor, light]);

  const listHeader = useMemo(() => ListHeaderFor(light), [light]);

  if (sections.length === 0) {
    return (
      <View className="px-4 pb-28">
        {listHeader}
        <View className="items-center justify-center py-14 px-4">
          <Text className="text-base text-center" style={{ color: light ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.25)' }}>
            No Transaction yet
          </Text>
          <Text className="text-base mt-1" style={{ color: light ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.15)' }}>Tap + to add Transactions</Text>
        </View>
      </View>
    );
  }

  // "All Time" / Overview has no date bound — it can be every transaction
  // the user has ever logged, potentially spanning years with many
  // transactions per month. SectionList virtualizes per row across
  // sections (unlike a hand-rolled "one FlatList item = one month's full
  // unvirtualized sub-list", which still mounts every transaction in
  // whichever months happen to be on screen). Rounded-card look is
  // reproduced per-row via section-relative index instead of a shared
  // non-virtualized wrapper.
  return (
    <Pressable onPress={closeOpenRow} style={{ flex: 1 }}>
      <SectionList
        sections={sections}
        keyExtractor={tx => tx.id}
        onScrollBeginDrag={closeOpenRow}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        ListHeaderComponent={listHeader}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 112 }}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        stickySectionHeadersEnabled={false}
        // Six, not twelve — a phone screen shows roughly this many rows
        // below the chart, and every extra one is a full row mount paid
        // synchronously on the switch. The rest stream in via
        // maxToRenderPerBatch as usual.
        initialNumToRender={6}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
      />
    </Pressable>
  );
}

export default memo(forwardRef(TransactionList));
