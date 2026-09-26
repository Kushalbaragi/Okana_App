import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS, Easing } from 'react-native-reanimated';
import BudgetStatusBar from './BudgetStatusBar';
import BudgetSetupModal from './BudgetSetupModal';
import BudgetPlan, { AddBudgetItemSheet } from './BudgetPlan';
import { TourHint } from './TourHint';
import { BackIcon } from './icons';
import SegmentedSwitch from './SegmentedSwitch';
import SavingsSection, { SavingsSheetsHost, useSavingsUI } from './SavingsSection';
import SavingsBoundary from './SavingsBoundary';
import ErrorBoundary from './ErrorBoundary';
import { useTourStep } from '../hooks/useTourStep';
import { SETTLE_EASING } from '../utils/motion';
import { OfflineBanner } from './OfflineBanner';

// The page has three sections, switched from the header: the budget bar it
// always was, savings goals, and debt (loans tracked the same way as a
// savings goal, just paid down instead of built up — see savingsShared.js's
// KIND_COPY and useSavings.js's own comment on how one goal shape covers
// both).
const SECTIONS = [
  { id: 'budget', label: 'Budget' },
  { id: 'savings', label: 'Savings' },
  { id: 'debt', label: 'Debt' },
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
function SpendCalendarModal({ open, onClose, onClosed, budget, savings, budgetPlan, light = false, userId, slideX }) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Which section is showing. Deliberately survives closing and reopening
  // (this component stays mounted between opens), so it comes back where it
  // was left. Both sections stay mounted and crossfade rather than swapping,
  // so switching costs nothing and keeps each one's own state — the selected
  // day, the open goal.
  const [section, setSection] = useState('budget');
  const [detailGoalId, setDetailGoalId] = useState(null);
  const savingsUI = useSavingsUI();
  // Debt is a second, fully independent instance of the same goal-tracking
  // UI — its own sheet/confirm state and its own selected-item id, since
  // opening a loan's detail page has nothing to do with a savings goal's.
  const debtUI = useSavingsUI();
  const [detailDebtId, setDetailDebtId] = useState(null);

  // One opacity per section rather than a single 0..1 slider (that only
  // ever worked for exactly two) — each animates toward 1 when it's the
  // active section and 0 otherwise, same duration/easing for all three, so
  // the crossfade reads identically regardless of which pair is swapping.
  const budgetProgress = useSharedValue(1);
  const savingsProgress = useSharedValue(0);
  const debtProgress = useSharedValue(0);
  useEffect(() => {
    const opts = { duration: SECTION_FADE_MS, easing: Easing.out(Easing.cubic) };
    budgetProgress.value = withTiming(section === 'budget' ? 1 : 0, opts);
    savingsProgress.value = withTiming(section === 'savings' ? 1 : 0, opts);
    debtProgress.value = withTiming(section === 'debt' ? 1 : 0, opts);
  }, [section, budgetProgress, savingsProgress, debtProgress]);
  const budgetLayerStyle = useAnimatedStyle(() => ({ opacity: budgetProgress.value }));
  const savingsLayerStyle = useAnimatedStyle(() => ({ opacity: savingsProgress.value }));
  const debtLayerStyle = useAnimatedStyle(() => ({ opacity: debtProgress.value }));

  const { onSubmit: submitBudget, onSetupClosed, lastMonthAmount, lastMonthSpent, ...budgetBar } = budget || {};
  const [budgetSheetOpen, setBudgetSheetOpen] = useState(false);
  const openBudgetSheet = useCallback(() => setBudgetSheetOpen(true), []);
  // The Budget Plan's one popup — same "render at the page root, slide over
  // everything" treatment as the savings/debt sheets below.
  const [addItemOpen, setAddItemOpen] = useState(false);
  const openAddItem = useCallback(() => setAddItemOpen(true), []);
  const closeAddItem = useCallback(() => setAddItemOpen(false), []);
  // What a plan line is most often for: something already tracked as a loan
  // or a savings goal, so its name is one tap away instead of retyped.
  // Active ones only — a cleared loan or a finished goal isn't something
  // you're still planning to pay into.
  const planSuggestions = useMemo(
    () => [...(savings?.debts || []), ...(savings?.goals || [])].map(g => g.name),
    [savings?.debts, savings?.goals]
  );

  // A small bottom toast confirming a Budget Plan line's checkbox actually
  // did something to the real ledger (added or removed an expense) — not
  // the top banner, OfflineBanner already owns that spot. Self-timed:
  // appears when the text is set, clears itself after a fixed duration.
  const [planToastText, setPlanToastText] = useState(null);
  const planToastProgress = useSharedValue(0);
  const planToastTimerRef = useRef(null);
  const showPlanToast = useCallback((text) => {
    if (planToastTimerRef.current) clearTimeout(planToastTimerRef.current);
    setPlanToastText(text);
    planToastProgress.value = withTiming(1, { duration: 480, easing: SETTLE_EASING });
    planToastTimerRef.current = setTimeout(() => {
      planToastProgress.value = withTiming(0, { duration: 420, easing: Easing.in(Easing.cubic) }, finished => {
        if (finished) runOnJS(setPlanToastText)(null);
      });
    }, 1800);
  }, [planToastProgress]);
  useEffect(() => () => { if (planToastTimerRef.current) clearTimeout(planToastTimerRef.current); }, []);
  const planToastStyle = useAnimatedStyle(() => ({
    opacity: planToastProgress.value,
    transform: [{ translateY: (1 - planToastProgress.value) * 60 }],
  }));
  const handleItemChecked = useCallback((checked, name) => {
    showPlanToast(checked ? `${name} added to your expenses` : `${name} expense removed`);
  }, [showPlanToast]);

  const budgetSheetClosedAtRef = useRef(0);
  const closeBudgetSheet = useCallback(() => {
    budgetSheetClosedAtRef.current = Date.now();
    setBudgetSheetOpen(false);
    onSetupClosed?.();
  }, [onSetupClosed]);

  const openGoal = useCallback((id) => setDetailGoalId(id), []);
  const closeGoal = useCallback(() => setDetailGoalId(null), []);
  const openDebt = useCallback((id) => setDetailDebtId(id), []);
  const closeDebt = useCallback(() => setDetailDebtId(null), []);

  // Back steps out one level at a time: an open sheet, then an open goal, and
  // only then the whole page. Also what the Android back button does. Debt's
  // own sheet/confirm/detail are checked the same way, independently of
  // Savings' — whichever section is actually showing is the one with
  // something open to step back out of.
  const { sheetOpen, closeSheet, confirmOpen, closeConfirm } = savingsUI;
  const { sheetOpen: debtSheetOpen, closeSheet: closeDebtSheet, confirmOpen: debtConfirmOpen, closeConfirm: closeDebtConfirm } = debtUI;
  const handleBack = useCallback(() => {
    if (budgetSheetOpen) { closeBudgetSheet(); return; }
    if (addItemOpen) { closeAddItem(); return; }
    if (confirmOpen) { closeConfirm(); return; }
    if (debtConfirmOpen) { closeDebtConfirm(); return; }
    if (sheetOpen) { closeSheet(); return; }
    if (debtSheetOpen) { closeDebtSheet(); return; }
    if (section === 'savings' && detailGoalId != null) { setDetailGoalId(null); return; }
    if (section === 'debt' && detailDebtId != null) { setDetailDebtId(null); return; }
    onClose();
  }, [
    budgetSheetOpen, closeBudgetSheet, addItemOpen, closeAddItem, confirmOpen, closeConfirm, debtConfirmOpen, closeDebtConfirm,
    sheetOpen, closeSheet, debtSheetOpen, closeDebtSheet, section, detailGoalId, detailDebtId, onClose,
  ]);

  // First-run tour for this page: once a budget actually exists, what the
  // budget bar shows. Separate from the Home-screen tour in app/(app)/index.js
  // — this one only makes sense once the user has actually opened the
  // calendar, not forced on them right after signup.
  const budgetSectionRef = useRef(null);
  const budgetTour = useTourStep(userId, 'calendar_budget_left');
  const [budgetTourActive, setBudgetTourActive] = useState(false);

  // Same pattern as AddModal — managed independently of RN's Modal
  // animationType so `visible` stays mounted through the close animation.
  // Slides in from the right (like a pushed page) rather than up from the
  // bottom — translateX/windowWidth, not translateY/windowHeight. No drag-
  // to-dismiss any more — the back button below is the only way to close
  // this now.
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
      setDetailDebtId(null);
      setBudgetSheetOpen(false);
      setAddItemOpen(false);
      savingsUI.closeSheet();
      savingsUI.closeConfirm();
      debtUI.closeSheet();
      debtUI.closeConfirm();
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


  const advanceBudgetTour = useCallback(() => {
    budgetTour.markSeen();
    setBudgetTourActive(false);
  }, [budgetTour]);

  const pageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pageTranslateX.value }],
  }));

  useEffect(() => {
    // Resets immediately on close so a tour hint mid-flow doesn't linger
    // pointing at a row that's now sliding off-screen with the sheet.
    // Only the Budget section has anything for the tour to point at.
    if (!open || section !== 'budget') { setBudgetTourActive(false); return; }
    // Not while the budget sheet is up: setting a budget makes `hasBudget` true
    // before the sheet has finished, and the tour must not appear over it.
    if (!userId || budgetTourActive || budgetSheetOpen) return;
    // Budget-left only makes sense once a budget actually exists — deferred
    // (not skipped outright) until one does.
    if (budgetTour.seen || !budget?.hasBudget) return;
    // Just after the budget sheet closed, the step waits a further beat so
    // the tour doesn't land the instant the sheet goes.
    const sinceSheetClosed = Date.now() - budgetSheetClosedAtRef.current;
    // At least the sheet's own opening slide, so the tour doesn't spotlight
    // something that's still animating into place.
    const settle = CALENDAR_SLIDE_DURATION + 150;
    const delay = sinceSheetClosed < BUDGET_SHEET_TOUR_DELAY_MS
      ? Math.max(settle, BUDGET_SHEET_TOUR_DELAY_MS - sinceSheetClosed)
      : settle;
    const t = setTimeout(() => setBudgetTourActive(true), delay);
    return () => clearTimeout(t);
  }, [open, section, userId, budgetTourActive, budgetSheetOpen, budgetTour.seen, budget?.hasBudget]);

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
                {/* Narrower than the old 2-option width (92) — a third
                    option at that width would run right up against the
                    header's own side margins on a narrower phone. */}
                <SegmentedSwitch options={SECTIONS} value={section} onChange={setSection} buttonWidth={78} light={light} />
              </View>
              <View style={{ width: 36 }} />
            </View>

            {/* Both sections fill the space under the header and crossfade;
                only the visible one takes touches. */}
            <View style={{ flex: 1 }}>
              <Animated.View style={[StyleSheet.absoluteFill, budgetLayerStyle]} pointerEvents={section === 'budget' ? 'auto' : 'none'}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: windowHeight * 0.06, paddingBottom: insets.bottom + 40 }}
            >
                {/* The budget bar draws its own gray card now (see
                    BudgetStatusBar.js) — full width, same as the Budget Plan
                    below it, not capped to a narrow centred column any more.
                    The calendar heatmap that used to fill this block (month
                    nav, day-of-week header, the shaded grid) was cut
                    entirely, not just visually trimmed. */}
                {budget && <View ref={budgetSectionRef}><BudgetStatusBar {...budgetBar} onSetup={openBudgetSheet} light={light} /></View>}

                {/* The space that heatmap left behind, now a plan for where
                    next month's money is going, written before the salary
                    that pays for it lands — see BudgetPlan.js. */}
                {budgetPlan && (
                  <View style={{ marginTop: 24 }}>
                    <BudgetPlan plan={budgetPlan} onAddPress={openAddItem} onItemChecked={handleItemChecked} light={light} />
                  </View>
                )}
            </ScrollView>

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

              <Animated.View style={[StyleSheet.absoluteFill, debtLayerStyle]} pointerEvents={section === 'debt' ? 'auto' : 'none'}>
                <SavingsBoundary light={light} onReset={closeDebt}>
                  <SavingsSection
                    kind="debt"
                    savings={savings}
                    ui={debtUI}
                    active={open && section === 'debt'}
                    light={light}
                    detailGoalId={detailDebtId}
                    onOpenGoal={openDebt}
                    onCloseGoal={closeDebt}
                  />
                </SavingsBoundary>
              </Animated.View>
            </View>

            <TourHint
              visible={budgetTourActive}
              targetRef={budgetSectionRef}
              description="This shows what's left in your budget this month."
              onNext={advanceBudgetTour}
            />

            {/* Last child of the page, so its sheets slide up over everything
                above — header included. */}
            <ErrorBoundary
              resetKeys={[savingsUI.sheetData, savingsUI.confirmData]}
              onError={() => { savingsUI.closeSheet(); savingsUI.closeConfirm(); }}
            >
              <SavingsSheetsHost savings={savings} ui={savingsUI} light={light} />
            </ErrorBoundary>
            <ErrorBoundary
              resetKeys={[debtUI.sheetData, debtUI.confirmData]}
              onError={() => { debtUI.closeSheet(); debtUI.closeConfirm(); }}
            >
              <SavingsSheetsHost savings={savings} ui={debtUI} light={light} kind="debt" />
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

            {/* Budget Plan's own add popup — same overlay treatment as the
                budget-setup sheet just above. */}
            {budgetPlan && (
              <ErrorBoundary resetKeys={[addItemOpen]} onError={() => setAddItemOpen(false)}>
                <AddBudgetItemSheet
                  open={addItemOpen}
                  onClose={closeAddItem}
                  onSubmit={budgetPlan.addItem}
                  suggestions={planSuggestions}
                  light={light}
                />
              </ErrorBoundary>
            )}

            {/* The Budget Plan checkbox's own toast (see above) — a bottom
                pill, out of OfflineBanner's way at the top. */}
            {!!planToastText && (
              <Animated.View
                pointerEvents="none"
                style={[{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 24, alignItems: 'center', zIndex: 90 }, planToastStyle]}
              >
                <View
                  style={{
                    maxWidth: '85%', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 9999,
                    backgroundColor: light ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.92)',
                  }}
                >
                  <Text numberOfLines={1} style={{ color: light ? '#ffffff' : '#111111', fontSize: 13, fontWeight: '600' }}>{planToastText}</Text>
                </View>
              </Animated.View>
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
