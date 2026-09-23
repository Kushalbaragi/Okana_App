import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, InteractionManager, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  LinearTransition,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { parseISO } from 'date-fns';
import TransactionItem from './TransactionItem';
import { formatCurrency } from '../utils/format';
import { textColor, INCOME_TEXT } from '../utils/colors';
import { CAPTION } from '../utils/type';
import { MONTH_NAMES } from '../utils/monthlyRecap';
import { ChevronRight, BackIcon } from './icons';
import { SETTLE_EASING } from '../utils/motion';

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

// How long the tour's demo swipe holds the delete button in view before closing.
const DEMO_SWIPE_HOLD_MS = 1300;

// How many transactions the home shows before the rest are behind "all N
// transactions". Three is about what fits under the chart without the page
// turning into a list to be read — the whole month is one tap away.
const PREVIEW_ROWS = 3;

// How long a step deeper (or back out) takes to slide across. The outgoing
// and incoming content are on screen together for this whole window — one
// sliding out, one sliding in — so it reads as the card's contents being
// swapped sideways rather than the card itself being replaced.
const NAV_SLIDE_MS = 340;
// How far the OUTGOING content travels, as a fraction of the incoming one's
// distance. Both move the same way; the old one just lags behind instead of
// keeping pace — the depth cue that makes a push read as one layer sliding
// over another rather than two unrelated panels swapping places.
const NAV_PARALLAX = 0.28;
// A tab/range switch is a change of subject, not a move through anything,
// so its content crossfades in place instead of sliding.
const TAB_FADE_MS = 220;
// How long the card takes to grow/shrink to a new content height. Ease-OUT
// (same family as the slide's SETTLE_EASING, just a touch less abrupt), not
// the ease-in-out this used to be: an in-out curve barely moves for the
// first ~15% of its duration, which on a resize read as the card hesitating
// before it started. Ease-out is already moving at full speed on frame one.
const CARD_HEIGHT_MS = 280;
const CARD_HEIGHT_EASING = Easing.bezier(0.22, 1, 0.36, 1);
const CARD_HEIGHT_TIMING = { duration: CARD_HEIGHT_MS, easing: CARD_HEIGHT_EASING };

// Predicts the card's height for a piece of content from what's been
// measured before, so a resize can start the moment the content swaps
// instead of waiting to be told the real height (see cardHeight below).
// `metrics` holds a per-row height for each kind of row list, and a whole-
// layer height for the empty state. Rows are uniform within a kind. null =
// not measured yet, caller falls back to waiting for the real measurement.
function predictCardHeight(metrics, kind, count) {
  if (kind === 'empty') return metrics.empty ?? null;
  // Transactions no longer predict: the preview carries an "all N" row that
  // the others don't, so the rows-are-uniform assumption below doesn't hold
  // for them. They fall back to waiting for onLayout, which is what every
  // kind did before predicting existed — and at three rows there's nothing
  // like the pause a whole month's worth used to cost.
  if (kind === 'tx') return null;
  const rowH = metrics[kind];
  if (rowH == null || count <= 0) return null;
  return count * rowH;
}

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

// Rows are flat now — the card container below owns the corner radius and
// clips them, so the rounding no longer has to be reconstructed per row.
// That's what lets the container stay mounted (and keep its shape) while
// the rows inside it slide or fade out from under it.

// One step in the hierarchy — a year in All Time, or a month inside a year.
// Deliberately the same shape as a transaction row (same type scale,
// padding, card corners, divider treatment) so drilling in doesn't feel
// like moving between two differently-designed lists. The chevron is the
// only thing marking it as a step rather than a leaf.
function DrillRow({ label, total, cardColor, light, amountColor, onPress }) {
  return (
    <View style={{ backgroundColor: cardColor }}>
      <Pressable
        onPress={onPress}
        className="flex-row items-center justify-between py-4 px-4"
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <View className="flex-row items-center flex-1 pr-3">
          <Text className="text-base" style={{ color: light ? '#111111' : '#ffffff' }}>{label}</Text>
        </View>

        <View className="flex-row items-center shrink-0" style={{ gap: 6 }}>
          <Text className="text-base font-medium" style={{ color: amountColor }}>{formatCurrency(total)}</Text>
          <ChevronRight color={light ? 'rgba(0,0,0,0.25)' : undefined} />
        </View>
      </Pressable>
    </View>
  );
}

// At the root of a view this is just the section label the list always had.
// One level deeper it becomes the Back control, with where-you-are on the
// right — one row doing both jobs rather than stacking a breadcrumb above
// the label.
function ListHeader({ backLabel, currentLabel, onBack, light }) {
  const labelColor = textColor(light).disabled;
  // Nothing at the root any more: the list is the only thing below the
  // chart, so a "TRANSACTIONS" label above it was naming something already
  // obvious. The Back control below still earns its place.
  if (!onBack) return null;
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
  // Handed the card element the rows sit on, for a caller that wants to point
  // at it (the tour outlines it).
  cardRef,
}, ref) {
  // Drives how far the sliding content travels — see navAnimations below.
  const { width: windowWidth } = useWindowDimensions();
  // The raised surface the rows sit on. This used to be the same colour as
  // the page behind it, which meant the per-row corner radii had nothing to
  // show against and the list read as loose text rather than a card.
  // The page's own background, not a raised fill: the rows sit directly on
  // the screen now rather than inside a card. They still have to paint an
  // opaque colour of their own — a swiped-open row would otherwise show its
  // own delete button through itself — so this is the page colour rather
  // than `transparent`.
  const cardColor = light ? '#FAFAF8' : '#000000';
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
  // A change of *subject* — the Expense/Income/Overview tab, or the
  // Month/Year/All Time range. Starts a new browse from the top rather than
  // stranding the user at a depth that belonged to the previous view, and
  // crossfades, since it isn't a move along anything.
  const contextKey = `${timeRange}|${activeTab}|${isOverview}`;
  const [prevContextKey, setPrevContextKey] = useState(contextKey);
  const contextChanged = contextKey !== prevContextKey;
  if (contextChanged) {
    setPrevContextKey(contextKey);
    setDrill({ year: null, month: null });
    setNavMode('switch');
  }

  // A change of *period* — a different month, year or day of the same view.
  // That's a move along a timeline, so it slides in the direction of
  // travel: a later period comes in from the right, an earlier one from the
  // left. `periodOrder` is just a sortable stamp for deciding which way.
  // Skipped when the subject changed in the same pass (that's a fade, and
  // the period usually moves along with it) — prevPeriod is still synced so
  // the *next* move compares against the right thing.
  const periodKey = `${year}|${selectedMonth ?? ''}|${selectedDay ?? ''}`;
  const periodOrder = (year ?? 0) * 10000 + ((selectedMonth ?? 0) + 1) * 100 + (selectedDay ?? 0);
  const [prevPeriod, setPrevPeriod] = useState({ key: periodKey, order: periodOrder });
  if (periodKey !== prevPeriod.key) {
    setPrevPeriod({ key: periodKey, order: periodOrder });
    if (!contextChanged) setNavMode(periodOrder >= prevPeriod.order ? 'deeper' : 'back');
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
  // Asking for the whole list applies to the list that was asked about —
  // a different month, tab or drill level starts back at the preview.
  const [showAll, setShowAll] = useState(false);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setSettled(false);
    setShowAll(false);
  }
  useEffect(() => {
    if (settled) return undefined;
    const handle = InteractionManager.runAfterInteractions(() => setSettled(true));
    return () => handle.cancel();
  }, [settled, filterKey]);

  // Hoisted rather than inlined at the call site so memo(TransactionItem)
  // keeps getting stable props and can actually bail out of re-rendering
  // rows that haven't changed.
  const renderTransaction = useCallback(({ item, index }) => {
    const card = (
      <Animated.View
        key={item.id}
        layout={settled ? ROW_LAYOUT_TRANSITION : undefined}
        entering={item.id === justAddedId ? rowEntering : undefined}
        style={{ backgroundColor: cardColor }}
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
      </Animated.View>
    );
    // Only the first paint's top rows animate — once `revealing` flips,
    // every later render, for any reason, just shows the card directly.
    const shouldAnimate = revealing && index < REVEAL_ANIMATE_MAX;
    return shouldAnimate ? <RevealRow key={item.id} index={index}>{card}</RevealRow> : card;
  }, [settled, revealing, justAddedId, cardColor, isOverview, isIncome, onEdit, onDelete, registerSwipeable, onSwipeOpen, onCardPress, light]);

  const drillAmountColor = isIncome && !isOverview
    ? INCOME_TEXT
    : textColor(light).tertiary;

  const renderYear = useCallback(({ item }) => (
    <DrillRow
      key={item.year}
      label={String(item.year)}
      total={Math.abs(item.total)}
      cardColor={cardColor}
      light={light}
      amountColor={drillAmountColor}
      onPress={() => openYear(item.year)}
    />
  ), [cardColor, light, drillAmountColor, openYear]);

  const renderMonth = useCallback(({ item }) => (
    <DrillRow
      key={item.month}
      label={MONTH_NAMES[item.month]}
      total={Math.abs(item.total)}
      cardColor={cardColor}
      light={light}
      amountColor={drillAmountColor}
      onPress={() => openMonth(item.month)}
    />
  ), [cardColor, light, drillAmountColor, openMonth]);

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

  // Identifies the content currently inside the card. Changing it swaps the
  // inner layer (and plays the transition below); the card container itself
  // is outside this and never remounts, which is the whole point — the
  // shell stays put while its contents are replaced.
  const contentKey = `${contextKey}|${periodKey}|${level}|${drill.year ?? ''}|${drill.month ?? ''}`;

  // The ScrollView lives outside the keyed layer above (it has to — it's
  // part of the card's shell, not its contents), so it keeps its offset
  // across a navigation. That offset belongs to content that no longer
  // exists: drilling Year → Month from halfway down the year's list opened
  // the month already scrolled into the middle of it. Every contentKey
  // change is a completely different list, so every one of them starts at
  // the top.
  //
  // Not animated, deliberately: the reset has to be instantaneous so it
  // doesn't read as a second motion competing with the slide. It lands
  // while the outgoing layer is still fading out, which is what keeps it
  // from being visible as a jump.
  const scrollRef = useRef(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [contentKey]);

  // Built by hand rather than using Reanimated's SlideIn*/SlideOut*
  // presets. Those animate `originX` — the element's layout position —
  // which fights the absolute left:0/right:0 pinning these layers need in
  // order to overlap, and left the outgoing content travelling the opposite
  // way to the incoming one. A translateX is independent of layout, and
  // lets the outgoing layer move a fraction of the distance for the
  // parallax.
  const navAnimations = useMemo(() => {
    const full = windowWidth;
    const lag = windowWidth * NAV_PARALLAX;
    const cfg = { duration: NAV_SLIDE_MS, easing: SETTLE_EASING };
    const enterFrom = from => () => {
      'worklet';
      return {
        initialValues: { transform: [{ translateX: from }] },
        animations: { transform: [{ translateX: withTiming(0, cfg) }] },
      };
    };
    // The outgoing layer fades as it goes: the two overlap inside the
    // card, and nothing here controls which of them the platform paints on
    // top, so letting the old one dissolve keeps the handover clean either
    // way round.
    const exitTo = to => () => {
      'worklet';
      return {
        initialValues: { transform: [{ translateX: 0 }], opacity: 1 },
        animations: {
          transform: [{ translateX: withTiming(to, cfg) }],
          opacity: withTiming(0, cfg),
        },
      };
    };
    return {
      // Forward: the new content comes in from the right and the old one
      // lags away to the left — both travelling left, together.
      enterForward: enterFrom(full),
      exitForward: exitTo(-lag),
      // Back: the exact reverse, both travelling right.
      enterBack: enterFrom(-lag),
      exitBack: exitTo(full),
    };
  }, [windowWidth]);

  // A step through the hierarchy slides; a tab/range switch crossfades in
  // place (it's a change of subject, not a move through anything); the very
  // first paint does neither.
  const entering =
    navMode === 'deeper' ? navAnimations.enterForward :
    navMode === 'back' ? navAnimations.enterBack :
    navMode === 'switch' ? FadeIn.duration(TAB_FADE_MS) :
    undefined;
  const exiting =
    navMode === 'deeper' ? navAnimations.exitForward :
    navMode === 'back' ? navAnimations.exitBack :
    navMode === 'switch' ? FadeOut.duration(TAB_FADE_MS) :
    undefined;

  // Every content layer is absolutely positioned so the outgoing and
  // incoming ones can overlap during a transition — which means the
  // container has no intrinsic height of its own and has to be told one.
  // The active layer reports its natural height via onLayout and the
  // container animates to it, so adding/removing rows (or landing on a
  // month with a different number of them) grows or shrinks the card
  // smoothly instead of jumping. The first measurement is applied without
  // animating, since there's no previous height to travel from.
  //
  // onLayout alone is late, though: it only fires once the new layer's rows
  // have all mounted and been laid out, plus a native→JS hop, so the resize
  // used to sit still at the old height for that whole stretch — the pause
  // between switching from an empty tab to a full one and the card
  // opening up. So when the content swaps, the height is *predicted* from
  // the row count and previously measured row heights (predictCardHeight)
  // and the animation starts in the same commit, before the new layer has
  // even laid out. onLayout stays as the source of truth: it records those
  // row heights, and corrects the target if the prediction was off. A kind
  // of content that has never been measured yet has no prediction and just
  // waits for onLayout, as before.
  const cardHeight = useSharedValue(0);
  const measuredRef = useRef(false);
  const targetHeightRef = useRef(0);
  const metricsRef = useRef({});
  const contentKeyRef = useRef(contentKey);
  contentKeyRef.current = contentKey;

  const contentKind =
    level === 'years' ? 'years' :
    level === 'months' ? 'months' :
    items.length === 0 ? 'empty' : 'tx';
  const contentCount =
    level === 'years' ? yearRows.length :
    level === 'months' ? monthRows.length :
    items.length;

  const onContentLayout = useCallback((key, kind, count, e) => {
    // A layer that's on its way out can still fire onLayout; only the one
    // actually being shown should drive the card's height.
    if (key !== contentKeyRef.current) return;
    const h = e.nativeEvent.layout.height;
    if (h === 0) return;
    // 'tx' is skipped: its layer can carry an extra "all N" row, so a
    // per-row figure taken from it would be wrong — and predictCardHeight
    // doesn't ask for one anyway.
    if (kind === 'empty') metricsRef.current.empty = h;
    else if (kind !== 'tx' && count > 0) metricsRef.current[kind] = h / count;
    if (!measuredRef.current) {
      measuredRef.current = true;
      targetHeightRef.current = h;
      cardHeight.value = h;
      return;
    }
    // Already heading here (the prediction was right) — re-issuing the same
    // target would just restart the animation's clock mid-flight.
    if (Math.abs(h - targetHeightRef.current) < 0.5) return;
    targetHeightRef.current = h;
    cardHeight.value = withTiming(h, CARD_HEIGHT_TIMING);
  }, [cardHeight]);

  // Layout effect, not a regular one: this needs to run in the same commit
  // that swaps the content, before paint. Only on a content swap (contentKey)
  // — a row added or removed within the same content resizes through
  // onLayout, alongside its own row transition.
  useLayoutEffect(() => {
    if (!measuredRef.current) return;
    const predicted = predictCardHeight(metricsRef.current, contentKind, contentCount);
    if (predicted == null || Math.abs(predicted - targetHeightRef.current) < 0.5) return;
    targetHeightRef.current = predicted;
    cardHeight.value = withTiming(predicted, CARD_HEIGHT_TIMING);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey]);
  const cardHeightStyle = useAnimatedStyle(() => ({ height: cardHeight.value }));

  let rows;
  if (level === 'years' || level === 'months') {
    const data = level === 'years' ? yearRows : monthRows;
    const renderRow = level === 'years' ? renderYear : renderMonth;
    rows = data.map((item, index) => renderRow({ item, index }));
  } else if (items.length === 0) {
    rows = (
      <View className="items-center justify-center py-14 px-4">
        <Text className="text-base text-center" style={{ color: textColor(light).tertiary }}>
          No Transaction yet
        </Text>
        <Text className="text-base mt-1" style={{ color: textColor(light).disabled }}>Tap + to add Transactions</Text>
      </View>
    );
  } else {
    // Only the first few, unless asked for the rest. The whole month used
    // to unroll under the chart, which made the home a list to be read
    // rather than a figure to be glanced at.
    const capped = !showAll && items.length > PREVIEW_ROWS;
    const shown = capped ? items.slice(0, PREVIEW_ROWS) : items;
    rows = (
      <>
        {shown.map((item, index) => renderTransaction({ item, index }))}
        {capped && (
          <Pressable
            onPress={() => setShowAll(true)}
            style={{ backgroundColor: cardColor, paddingVertical: 14, alignItems: 'center' }}
            accessibilityRole="button"
            accessibilityLabel={`Show all ${items.length} transactions`}
          >
            <Text style={[CAPTION, { color: textColor(light).tertiary }]}>
              all {items.length} transactions
            </Text>
          </Pressable>
        )}
      </>
    );
  }

  // The header sits OUTSIDE the card, not inside it. Only the card's
  // contents should travel on a drill-in; sliding the section label and the
  // Back control along with them made the whole panel look like it was
  // being replaced, rather than one level handing off to the next
  // underneath a heading that stays put.
  return (
    <Pressable onPress={closeOpenRow} style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16 }}>{header}</View>
      <ScrollView
        ref={scrollRef}
        onScrollBeginDrag={closeOpenRow}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 112 }}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        {/* The card. Stays mounted and keeps its shape across every switch
            and every step through the hierarchy — only its height animates
            and its contents change. `overflow: hidden` is what clips the
            sliding layers to the card's rounded edges instead of letting
            them travel across the rest of the screen.

            This is a ScrollView over mapped rows rather than a FlatList,
            which does cost the virtualization a FlatList gave: an outgoing
            and an incoming layer have to overlap for the slide, and the
            active one has to report a natural height for the card to
            animate to — neither of which a virtualized, self-scrolling list
            can do. The blast radius is bounded: every path through the
            hierarchy ends inside a single month, so the longest this ever
            renders is one month of transactions. */}
        <Animated.View
          ref={cardRef}
          style={[
            { backgroundColor: cardColor, overflow: 'hidden' },
            cardHeightStyle,
          ]}
        >
          <Animated.View
            key={contentKey}
            entering={entering}
            exiting={exiting}
            onLayout={e => onContentLayout(contentKey, contentKind, contentCount, e)}
            style={{ position: 'absolute', left: 0, right: 0, top: 0 }}
          >
            {rows}
          </Animated.View>
        </Animated.View>
      </ScrollView>
    </Pressable>
  );
}

export default memo(forwardRef(TransactionList));
