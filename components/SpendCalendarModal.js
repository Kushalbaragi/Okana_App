import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, runOnJS, Easing } from 'react-native-reanimated';
import { addMonths, subMonths, startOfMonth, getDaysInMonth } from 'date-fns';
import {
  formatCurrency,
  formatCurrencyFull,
  formatDateFull,
  getDailyExpenseTotals,
  getIntensityThresholds,
  getEarliestDate,
  spendShadeFor,
  today,
  toDateStr as toStr,
} from '../utils/format';
import { MONTH_NAMES as MONTHS } from '../utils/monthlyRecap';
import BudgetStatusBar from './BudgetStatusBar';
import BudgetSetupModal from './BudgetSetupModal';
import { TourHint } from './TourHint';
import { BackIcon } from './icons';
import SegmentedSwitch from './SegmentedSwitch';
import SavingsSection, { SavingsSheetsHost, useSavingsUI } from './SavingsSection';
import SavingsBoundary from './SavingsBoundary';
import ErrorBoundary from './ErrorBoundary';
import { useTourStep } from '../hooks/useTourStep';
import { SETTLE_EASING } from '../utils/motion';
import { OfflineBanner } from './OfflineBanner';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']; // Monday-first

// The page has two sections, switched from the header: the budget + spend
// calendar it always was, and savings goals.
const SECTIONS = [
  { id: 'budget', label: 'Budget' },
  { id: 'savings', label: 'Savings' },
];
// Same fade the home screen uses when a tab switches.
const SECTION_FADE_MS = 220;

// How long this page takes to slide in or out. Home used to animate in
// lockstep with it (sliding off to the left as this came in from the
// right), which is why this was once exported — that turned out to read as
// juddery rather than synchronized, so Home now stays put and only this
// page moves.
const CALENDAR_SLIDE_DURATION = 480;
// How long after the budget sheet closes before the tour may point at the budget
// bar — long enough that the sheet is gone and the new budget has been seen.
const BUDGET_SHEET_TOUR_DELAY_MS = 2000;
// The "tap a day" hint waits this long after the calendar has opened.
const TAP_DATE_TOUR_DELAY_MS = 2000;

// Each row slides up and fades in with a small stagger, rather than the
// whole day's list appearing at once.
function DayTransactionRow({ tx, index, light }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(index * 55, withTiming(1, { duration: 320, easing: SETTLE_EASING }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx.id]);

  const rowStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 14 }],
  }));

  return (
    <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, rowStyle]}>
      <Text className="text-base" numberOfLines={1} style={{ flex: 1, color: light ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)' }}>
        {tx.description || (tx.type === 'income' ? 'Income' : 'Expense')}
      </Text>
      <Text
        className="text-base"
        style={{
          fontWeight: '500',
          color: tx.type === 'income' ? '#4ade80' : light ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)',
        }}
      >
        {tx.type === 'income' ? '+' : '-'}{formatCurrencyFull(tx.amount)}
      </Text>
    </Animated.View>
  );
}

// `light` is a one-off experimental prop for trying a light theme on just
// the Dashboard (and the flows it opens) — see the matching comment in
// Header.js.
// `slideX` (optional) is a shared value this page keeps at its own horizontal
// position: full width while closed, 0 once it has slid in. Whoever passes one can
// read it to move in step with the page — Home uses it for its parallax. It is the
// page's own value rather than a second animation started elsewhere, so the two
// can never fall out of step (the page can't begin sliding until the native
// window is up, which a separate animation had no way to wait for).
// `budget` (or null) carries what the Budget section shows — loading, hasBudget,
// amount, spent, percent — plus what setting one needs: `onSubmit`, last month's
// amount and spend, and `onSetupClosed` for the caller's own bookkeeping when the
// sheet closes. The sheet opens right here on the page, not by closing it first.
function SpendCalendarModal({ open, onClose, onClosed, transactions, recap, budget, savings, light = false, userId, slideX }) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const now = new Date();
  const [view, setView] = useState(startOfMonth(now));
  const [selectedDate, setSelectedDate] = useState(null);

  // Which section is showing. Deliberately survives closing and reopening
  // (this component stays mounted between opens), so it comes back where it
  // was left. Both sections stay mounted and crossfade rather than swapping,
  // so switching costs nothing and keeps each one's own state — the selected
  // day, the open goal.
  const [section, setSection] = useState('budget');
  const [detailGoalId, setDetailGoalId] = useState(null);
  const savingsUI = useSavingsUI();
  const sectionProgress = useSharedValue(0); // 0 budget -> 1 savings
  useEffect(() => {
    sectionProgress.value = withTiming(section === 'savings' ? 1 : 0, { duration: SECTION_FADE_MS, easing: Easing.out(Easing.cubic) });
  }, [section, sectionProgress]);
  const budgetLayerStyle = useAnimatedStyle(() => ({ opacity: 1 - sectionProgress.value }));
  const savingsLayerStyle = useAnimatedStyle(() => ({ opacity: sectionProgress.value }));

  const { onSubmit: submitBudget, onSetupClosed, lastMonthAmount, lastMonthSpent, ...budgetBar } = budget || {};
  const [budgetSheetOpen, setBudgetSheetOpen] = useState(false);
  const openBudgetSheet = useCallback(() => setBudgetSheetOpen(true), []);
  const budgetSheetClosedAtRef = useRef(0);
  const closeBudgetSheet = useCallback(() => {
    budgetSheetClosedAtRef.current = Date.now();
    setBudgetSheetOpen(false);
    onSetupClosed?.();
  }, [onSetupClosed]);

  const openGoal = useCallback((id) => setDetailGoalId(id), []);
  const closeGoal = useCallback(() => setDetailGoalId(null), []);

  // Back steps out one level at a time: an open sheet, then an open goal, and
  // only then the whole page. Also what the Android back button does.
  const { sheetOpen, closeSheet, confirmOpen, closeConfirm } = savingsUI;
  const handleBack = useCallback(() => {
    if (budgetSheetOpen) { closeBudgetSheet(); return; }
    if (confirmOpen) { closeConfirm(); return; }
    if (sheetOpen) { closeSheet(); return; }
    if (section === 'savings' && detailGoalId != null) { setDetailGoalId(null); return; }
    onClose();
  }, [budgetSheetOpen, closeBudgetSheet, confirmOpen, closeConfirm, sheetOpen, closeSheet, section, detailGoalId, onClose]);

  // First-run tour for this page: that tapping a day shows its transactions,
  // and (only once a budget actually exists) what the budget bar shows. Separate
  // from the Home-screen tour in app/(app)/index.js — this one only makes sense
  // once the user has actually opened the calendar, not forced on them right
  // after signup.
  const spentDayRef = useRef(null);
  const budgetSectionRef = useRef(null);
  const tapDateTour = useTourStep(userId, 'calendar_tap_date');
  const budgetTour = useTourStep(userId, 'calendar_budget_left');
  const [calendarTourActive, setCalendarTourActive] = useState(null); // 'tapDate' | 'budget' | null

  // Same pattern as AddModal — managed independently of RN's Modal
  // animationType so `visible` stays mounted through the close animation.
  // Slides in from the right (like a pushed page) rather than up from the
  // bottom — translateX/windowWidth, not translateY/windowHeight. No drag-
  // to-dismiss any more — the back button below is the only way to close
  // this now, so there's no gesture to reconcile with the day-list
  // ScrollView's own vertical scrolling either.
  const [visible, setVisible] = useState(open);
  const ownPageX = useSharedValue(windowWidth);
  const pageTranslateX = slideX ?? ownPageX;
  // Guards handleModalShow below so it only ever drives the slide-in for an
  // actual open, never fires stale from some earlier mount.
  const openingRef = useRef(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
      openingRef.current = true;
      // Defaults to today so its transactions are visible right away
      // instead of an empty grid the user has to tap into first.
      setSelectedDate(today());
      // Otherwise browsing to a past/future month, closing, and reopening
      // later (even a different day) leaves the calendar stuck wherever it
      // was last left instead of back on the actual current month — this
      // modal stays mounted across opens/closes, so nothing else resets it.
      setView(startOfMonth(now));
      // The slide-in itself is kicked off from handleModalShow below, not
      // here: starting it in the same tick as setVisible(true) races the
      // native <Modal> window's own presentation, so the first frame or two
      // of the slide can be dropped. onShow fires once the modal is
      // actually up, which is the earliest point the transform is
      // guaranteed to be applied to something on screen.
    } else {
      openingRef.current = false;
      // Back to the list, sheet away — the page reopens fresh, not on
      // whichever goal or sheet it was closed from.
      setDetailGoalId(null);
      setBudgetSheetOpen(false);
      savingsUI.closeSheet();
      savingsUI.closeConfirm();
      pageTranslateX.value = withTiming(
        windowWidth,
        { duration: CALENDAR_SLIDE_DURATION, easing: SETTLE_EASING },
        finished => {
          if (!finished) return;
          runOnJS(setVisible)(false);
          // Signals the native <Modal> is actually gone — callers use this
          // (rather than a guessed timeout) to know it's safe to present a
          // different Modal without two being mounted at once, which is
          // broken on Android.
          if (onClosed) runOnJS(onClosed)();
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Fired by the native <Modal> once it has actually finished presenting —
  // see the comment above the `open` effect for why the slide-in waits for
  // this instead of starting immediately.
  const handleModalShow = useCallback(() => {
    if (!openingRef.current) return;
    pageTranslateX.value = withTiming(0, { duration: CALENDAR_SLIDE_DURATION, easing: SETTLE_EASING });
  }, [pageTranslateX]);


  const advanceCalendarTour = useCallback(() => {
    if (calendarTourActive === 'tapDate') tapDateTour.markSeen();
    else if (calendarTourActive === 'budget') budgetTour.markSeen();
    setCalendarTourActive(null);
  }, [calendarTourActive, tapDateTour, budgetTour]);

  const pageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pageTranslateX.value }],
  }));

  const year = view.getFullYear();
  const month = view.getMonth();
  // getDay() is Sunday-indexed (0-6) — remap so Monday is column 0, matching
  // the Monday-first DAYS header below.
  const rawFirstDay = view.getDay();
  const firstDay = rawFirstDay === 0 ? 6 : rawFirstDay - 1;
  const daysInMonth = getDaysInMonth(view);
  const todayStr = today();

  // Gated on `visible` — this component stays mounted (rendering null)
  // between opens rather than unmounting, so without this guard every
  // transaction add/edit/delete anywhere in the app would re-run these full
  // history scans even while the calendar is closed.
  const dailyTotals = useMemo(() => (visible ? getDailyExpenseTotals(transactions) : {}), [transactions, visible]);
  const thresholds = useMemo(() => (visible ? getIntensityThresholds(dailyTotals) : { low: 0, high: 0 }), [dailyTotals, visible]);
  const earliest = useMemo(() => (visible ? getEarliestDate(transactions) : null), [transactions, visible]);

  // The most recent day (in the currently-viewed month, not in the future)
  // that actually has spending on it — the "tap a date" tour step targets
  // this instead of today's cell, so tapping it during the tour actually
  // demonstrates something (a populated day view) rather than "You saved
  // today - Nothing spent" on a day that may have no data at all. Null
  // (and the step just stays deferred) when nothing in this month qualifies.
  const spentDayStr = useMemo(() => {
    if (!visible) return null;
    for (let d = daysInMonth; d >= 1; d--) {
      const str = toStr(new Date(year, month, d));
      if (str > todayStr) continue;
      if (dailyTotals[str] > 0) return str;
    }
    return null;
  }, [visible, dailyTotals, year, month, daysInMonth, todayStr]);

  // Below spentDayStr on purpose: its dependency list reads that value, and a
  // const can't be read before its declaration — Hermes' Babel transform
  // quietly tolerates it (const becomes var), a strict engine throws.
  useEffect(() => {
    // Resets immediately on close so a tour hint mid-flow doesn't linger
    // pointing at a row that's now sliding off-screen with the sheet.
    // Only the Budget section has anything for the tour to point at.
    if (!open || section !== 'budget') { setCalendarTourActive(null); return; }
    // Not while the budget sheet is up: setting a budget makes `hasBudget` true
    // before the sheet has finished, and the tour must not appear over it.
    if (!userId || calendarTourActive || budgetSheetOpen) return;
    // Deferred until there's an actual spent day to point at — same "only show
    // it once it's real" rule as budget-left below and the Home-screen tour's
    // swipe step. Budget-left only makes sense once a budget actually exists —
    // deferred (not skipped outright) until one does.
    const next = !tapDateTour.seen && spentDayStr ? 'tapDate'
      : !budgetTour.seen && budget?.hasBudget ? 'budget'
      : null;
    if (!next) return;
    // Just after the budget sheet closed, the budget step waits a further beat
    // so the tour doesn't land the instant the sheet goes.
    const sinceSheetClosed = Date.now() - budgetSheetClosedAtRef.current;
    // At least the sheet's own opening slide, so the tour doesn't spotlight
    // something that's still animating into place.
    const settle = CALENDAR_SLIDE_DURATION + 150;
    const delay = next === 'tapDate'
      ? TAP_DATE_TOUR_DELAY_MS
      : sinceSheetClosed < BUDGET_SHEET_TOUR_DELAY_MS
        ? Math.max(settle, BUDGET_SHEET_TOUR_DELAY_MS - sinceSheetClosed)
        : settle;
    const t = setTimeout(() => setCalendarTourActive(next), delay);
    return () => clearTimeout(t);
  }, [open, section, userId, calendarTourActive, budgetSheetOpen, tapDateTour.seen, spentDayStr, budgetTour.seen, budget?.hasBudget]);

  const dayTxs = useMemo(
    () => (visible && selectedDate
      ? transactions
        .filter(tx => tx.date === selectedDate)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      : []),
    [transactions, selectedDate, visible],
  );

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  function prevMonth() { setView(subMonths(view, 1)); setSelectedDate(null); }
  function nextMonth() { setView(addMonths(view, 1)); setSelectedDate(null); }

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleBack} onShow={handleModalShow}>
      {/* RN's <Modal> stays fully touch-active for its whole lifetime —
          `visible` only flips to false once the close animation below has
          actually finished, so without this the calendar icon (and anything
          else on Dashboard) is unreachable for the ~700ms this is sliding
          off-screen, even though it's already invisible. `open` (not
          `visible`) flips to false the instant a close starts, so touches
          fall through immediately instead of at the end. Same fix as
          AddModal's — see the comment there. */}
      {/* A <Modal> is its own native window, which the app's root
          GestureHandlerRootView doesn't reach — the goal cards' swipe-to-delete
          needs one in here (see AddModal). */}
      <GestureHandlerRootView style={{ flex: 1 }}>
      <Animated.View className="flex-1" style={[{ flex: 1, backgroundColor: light ? '#FAFAF8' : '#000000' }, pageStyle]} pointerEvents={open ? 'auto' : 'none'}>
        <View style={{ flex: 1 }}>
            {/* Replaces the old drag-handle pill (which read as a
                bottom-sheet affordance that stopped making sense once this
                became a side-slide page) — the back button is now the only
                way to close this. */}
            <View className="flex-row items-center px-4" style={{ paddingTop: insets.top + 10, paddingBottom: 8 }}>
              <Pressable
                onPress={handleBack}
                className="w-9 h-9 items-center justify-center rounded-xl"
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <BackIcon color={light ? 'rgba(0,0,0,0.7)' : undefined} />
              </Pressable>
              {/* Fixed to the back button's own height so the switch (a couple
                  of px taller) can't push everything below it down — the
                  Budget section sits exactly where it always did. */}
              <View style={{ flex: 1, height: 36, alignItems: 'center', justifyContent: 'center' }}>
                <SegmentedSwitch options={SECTIONS} value={section} onChange={setSection} buttonWidth={92} light={light} />
              </View>
              <View style={{ width: 36 }} />
            </View>

            {/* Both sections fill the space under the header and crossfade;
                only the visible one takes touches. */}
            <View style={{ flex: 1 }}>
              <Animated.View style={[StyleSheet.absoluteFill, budgetLayerStyle]} pointerEvents={section === 'budget' ? 'auto' : 'none'}>
            {/* Fixed — not inside any ScrollView, so it never scrolls or
                shifts regardless of how many transactions the day list
                below ends up showing. */}
            <View style={{ paddingHorizontal: 20, marginTop: windowHeight * 0.1 }}>
                {recap?.available && (
                  <Pressable
                    onPress={recap.onOpen}
                    className="flex-row items-center justify-center mb-4"
                    style={{ gap: 5, alignSelf: 'center' }}
                  >
                    <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#a855f7' }} />
                    <Text className="text-xs font-medium" style={{ color: light ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.4)' }}>
                      Monthly Summary ›
                    </Text>
                  </Pressable>
                )}

                {/* Budget + calendar grouped into one padded block — no
                    card surface, sits directly on the page background.
                    Top padding trimmed and matched by extra margin below
                    the budget bar, so Budget sits higher while the
                    calendar grid underneath stays put — just a wider gap
                    between the two. */}
                <View className="rounded-3xl px-4 pb-4" style={{ maxWidth: 320, alignSelf: 'center', width: '100%', paddingTop: 6 }}>
                  {budget && <View ref={budgetSectionRef} style={{ marginBottom: 10 }}><BudgetStatusBar {...budgetBar} onSetup={openBudgetSheet} light={light} hideDivider /></View>}

                  <View className="flex-row items-center justify-between mb-4">
                    <Pressable
                      onPress={prevMonth}
                      className="w-7 h-7 rounded-full items-center justify-center"
                      style={{ backgroundColor: light ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.07)' }}
                      accessibilityRole="button"
                      accessibilityLabel="Previous month"
                    >
                      <Text style={{ color: light ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)' }}>‹</Text>
                    </Pressable>
                    <Text className="text-base font-semibold" style={{ color: light ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)' }}>
                      {MONTHS[month]} {year}
                    </Text>
                    <Pressable
                      onPress={nextMonth}
                      className="w-7 h-7 rounded-full items-center justify-center"
                      style={{ backgroundColor: light ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.07)' }}
                      accessibilityRole="button"
                      accessibilityLabel="Next month"
                    >
                      <Text style={{ color: light ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)' }}>›</Text>
                    </Pressable>
                  </View>

                  <View className="flex-row mb-1.5">
                    {DAYS.map((d, i) => (
                      <View key={i} style={{ flex: 1 }}>
                        <Text className="text-center text-[11px] font-medium" style={{ color: light ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.25)' }}>
                          {d}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {weeks.map((week, wi) => (
                    <View key={wi} className="flex-row" style={{ gap: 5, marginBottom: 5 }}>
                      {week.map((d, i) => {
                        if (!d) return <View key={i} style={{ flex: 1 }} />;
                        const str = toStr(new Date(year, month, d));
                        const shade = spendShadeFor(str, { dailyTotals, thresholds, earliest, todayStr, light });
                        const isToday = str === todayStr;
                        const isSelected = selectedDate === str;
                        return (
                          <Pressable
                            key={i}
                            ref={str === spentDayStr ? spentDayRef : undefined}
                            disabled={!shade.isKnown}
                            onPress={() => setSelectedDate(prev => (prev === str ? null : str))}
                            className="aspect-square items-center justify-center rounded-md"
                            style={{
                              flex: 1,
                              backgroundColor: shade.bg,
                              borderWidth: isSelected ? 1.5 : isToday ? 1 : 0,
                              borderColor: isSelected
                                ? (light ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.65)')
                                : isToday
                                ? (light ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.3)')
                                : 'transparent',
                            }}
                          >
                            <Text style={{ color: shade.color, fontSize: 12, fontWeight: '500' }}>
                              {d}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}

                  <View className="flex-row items-center justify-center mt-3" style={{ gap: 12 }}>
                    <View className="flex-row items-center" style={{ gap: 4 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: 'rgba(34,197,94,0.5)' }} />
                      <Text style={{ fontSize: 10, color: light ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.30)' }}>No spend</Text>
                    </View>
                    <View className="flex-row items-center" style={{ gap: 4 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: 'rgba(255,75,75,0.5)' }} />
                      <Text style={{ fontSize: 10, color: light ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.30)' }}>Spent</Text>
                    </View>
                  </View>
                </View>
                </View>

            {/* Tapping a date loads its transactions right below the fixed
                group, each row sliding up and fading in with a small
                stagger. Scrolls internally (rather than growing the page)
                once there are enough to overflow the remaining space. */}
            {selectedDate && (
              <View style={{ flex: 1, marginTop: 20, paddingHorizontal: 20 }}>
                <View style={{ maxWidth: 320, alignSelf: 'center', width: '100%', flex: 1 }}>
                  <View className="flex-row items-center justify-between mb-3">
                    <Text className="text-base font-bold" style={{ color: light ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)' }}>
                      {formatDateFull(selectedDate)}
                    </Text>
                    <Text className="text-base font-bold" style={{ color: light ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)' }}>
                      {formatCurrency(dailyTotals[selectedDate] || 0)}
                    </Text>
                  </View>
                  {dayTxs.length === 0 ? (
                    <Text className="text-base" style={{ color: light ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.30)' }}>
                      You saved today - Nothing spent 🌿
                    </Text>
                  ) : (
                    <ScrollView
                      showsVerticalScrollIndicator={false}
                      style={{ flex: 1 }}
                      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
                    >
                      <View style={{ gap: 12 }}>
                        {dayTxs.map((tx, i) => (
                          <DayTransactionRow key={tx.id} tx={tx} index={i} light={light} />
                        ))}
                      </View>
                    </ScrollView>
                  )}
                </View>
              </View>
            )}

              </Animated.View>

              <Animated.View style={[StyleSheet.absoluteFill, savingsLayerStyle]} pointerEvents={section === 'savings' ? 'auto' : 'none'}>
                <SavingsBoundary light={light} onReset={closeGoal}>
                  <SavingsSection
                    savings={savings}
                    ui={savingsUI}
                    active={open && section === 'savings'}
                    light={light}
                    detailGoalId={detailGoalId}
                    onOpenGoal={openGoal}
                    onCloseGoal={closeGoal}
                  />
                </SavingsBoundary>
              </Animated.View>
            </View>

            <TourHint
              visible={calendarTourActive === 'tapDate'}
              targetRef={spentDayRef}
              description="Tap a date to see what you spent or earned that day."
              onNext={advanceCalendarTour}
            />
            <TourHint
              visible={calendarTourActive === 'budget'}
              targetRef={budgetSectionRef}
              description="This shows what's left in your budget this month."
              onNext={advanceCalendarTour}
            />

            {/* Last child of the page, so its sheets slide up over everything
                above — header included. */}
            <ErrorBoundary
              resetKeys={[savingsUI.sheetData, savingsUI.confirmData]}
              onError={() => { savingsUI.closeSheet(); savingsUI.closeConfirm(); }}
            >
              <SavingsSheetsHost savings={savings} ui={savingsUI} light={light} />
            </ErrorBoundary>

            {/* Setting a budget happens here, on the page: this is the same sheet the
                home screen opens in a window of its own, drawn as an overlay inside
                this one. It is above the page and the savings sheets, below the
                offline banner. */}
            {budget && (
              <ErrorBoundary resetKeys={[budgetSheetOpen]} onError={() => setBudgetSheetOpen(false)}>
                <BudgetSetupModal
                  inline
                  open={budgetSheetOpen}
                  onClose={closeBudgetSheet}
                  onSubmit={submitBudget}
                  lastMonthAmount={lastMonthAmount}
                  lastMonthSpent={lastMonthSpent}
                />
              </ErrorBoundary>
            )}

            {/* This page is a native <Modal>, its own window drawn over the root
                one, so the offline banner rendered at the app root is hidden
                behind it. This copy shows the same state from inside the window,
                last so it sits above the page and any open sheet. */}
            <OfflineBanner />
        </View>
      </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

export default memo(SpendCalendarModal);
