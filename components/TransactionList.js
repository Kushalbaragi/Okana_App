import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { View, Text, SectionList, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withTiming, LinearTransition } from 'react-native-reanimated';
import { parseISO } from 'date-fns';
import TransactionItem from './TransactionItem';
import { monthLabel } from '../utils/format';
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
    <Text
      className="text-sm font-medium uppercase tracking-wide mt-4 mb-3 px-1"
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

// Slides up + fades in on mount. Only ever plays for the list's very first
// paint (see hasRevealedRef in TransactionList) — switching tabs/periods
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
  // Attached to whichever row ends up first overall (across sections) —
  // lets the screen this list lives on target it for the "swipe to
  // edit/delete" tour step. Optional; TransactionList itself doesn't know
  // or care about tour state, it just exposes the target.
  firstRowRef,
  // Id of a transaction that was just added — that one row plays
  // rowEntering (fade + rise) and everything below it pushes down via
  // ROW_LAYOUT_TRANSITION. Every other row's mount (e.g. a tab switch's
  // full re-filter) stays exactly as cheap as before — see rowEntering's
  // own comment.
  justAddedId,
}, ref) {
  const bgColor = light ? '#FAFAF8' : '#0a0a0a';
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
  // open swipe, same as tapping blank list space.
  const onCardPress = useCallback(() => {
    if (openIdRef.current) closeOpenRow();
  }, [closeOpenRow]);

  // Exposed so the screen this list lives on can close an open swipe when
  // the user taps something entirely outside this component — the chart's
  // Expense/Income/Overview tabs, the month/year/All Time pills, the header
  // — none of which are descendants of TransactionList.
  useImperativeHandle(ref, () => ({ closeOpenRow }), [closeOpenRow]);

  const shouldGroup = isOverview || timeRange === '5y';

  // Flips to true right after the list's first paint — renderItem reads it
  // (not state, so flipping it doesn't itself trigger a re-render) to gate
  // the reveal animation to that first paint only.
  const hasRevealedRef = useRef(false);
  useEffect(() => {
    hasRevealedRef.current = true;
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

  if (sections.length === 0) {
    return (
      <View className="px-4 pb-28">
        {ListHeaderFor(light)}
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
        renderItem={({ item, index, section }) => {
          // The swipe-hint tour step targets whichever row is literally
          // first in the whole (possibly grouped) list, not just first
          // within its own section.
          const isFirstOverall = section === sections[0] && index === 0;
          const card = (
            <Animated.View
              ref={isFirstOverall ? firstRowRef : undefined}
              layout={ROW_LAYOUT_TRANSITION}
              entering={item.id === justAddedId ? rowEntering : undefined}
              style={{
                backgroundColor: bgColor,
                overflow: 'hidden',
                borderTopLeftRadius: index === 0 ? 12 : 0,
                borderTopRightRadius: index === 0 ? 12 : 0,
                borderBottomLeftRadius: index === section.data.length - 1 ? 12 : 0,
                borderBottomRightRadius: index === section.data.length - 1 ? 12 : 0,
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
              />
            </Animated.View>
          );
          // Only the first paint's top rows animate — once hasRevealedRef
          // flips (right after that first paint), every later render, for
          // any reason, just shows the card directly.
          const shouldAnimate = !hasRevealedRef.current && index < REVEAL_ANIMATE_MAX;
          return shouldAnimate ? <RevealRow index={index}>{card}</RevealRow> : card;
        }}
        renderSectionHeader={({ section }) =>
          section.title ? (
            <View
              className={`flex-row items-center justify-between mb-2 ${section.key === sections[0]?.key ? 'mt-0' : 'mt-6'}`}
              style={{ backgroundColor: bgColor }}
            >
              <Text className="text-sm font-medium uppercase tracking-wider" style={{ color: light ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.35)' }}>
                {section.title}
              </Text>
            </View>
          ) : null
        }
        ListHeaderComponent={ListHeaderFor(light)}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 112 }}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        stickySectionHeadersEnabled={false}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
      />
    </Pressable>
  );
}

export default memo(forwardRef(TransactionList));
