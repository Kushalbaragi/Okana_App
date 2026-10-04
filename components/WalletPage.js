import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, InteractionManager, View, Text, Pressable, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS, Easing } from 'react-native-reanimated';
import BudgetStatusBar from './BudgetStatusBar';
import BudgetSetupModal from './BudgetSetupModal';
import BudgetPlan, { AddBudgetItemSheet } from './BudgetPlan';
import { BackIcon } from './icons';
import SegmentedSwitch from './SegmentedSwitch';
import SavingsSection, { SavingsSheetsHost, useSavingsUI } from './SavingsSection';
import { ConfirmPill } from './ConfirmPill';
import { InlineConfirm } from './InlineConfirm';
import SavingsBoundary from './SavingsBoundary';
import ErrorBoundary from './ErrorBoundary';
import { SETTLE_EASING } from '../utils/motion';
import { formatCurrency } from '../utils/format';

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
const WALLET_SLIDE_DURATION = 480;
// How long after a Budget Plan line's delete is confirmed it goes ahead even
// if the dialog never reports having closed — same value and reasoning as
// Home's own DELETE_BACKSTOP_MS and SavingsSection's GOAL_DELETE_BACKSTOP_MS.
const DELETE_ITEM_BACKSTOP_MS = 700;
// How long after checking a plan line off before the "add to your
// transactions?" pill appears — still a beat, not an instant popup over the
// tap (same reasoning SavingsSection's own EMI confirm has), but short
// enough that it reads as a quick follow-up rather than the checkbox taking
// a moment to actually respond. Was 1500 (matching that EMI confirm
// exactly); dropped on its own since this specific wait read as sluggish
// and the two prompts don't need to share a number, just the same idea.
const PLAN_CHECK_DELAY_MS = 350;

// `light` is a one-off experimental prop for trying a light theme on just
// the Dashboard (and the flows it opens) — see the matching comment in
// Header.js.
// `slideX` (optional) is a shared value this page keeps at its own horizontal
// position: full width while closed, 0 once it has slid in. Whoever passes one can
// read it to move in step with the page — Home uses it for its parallax. It is the
// page's own value rather than a second animation started elsewhere, so the two
// can never fall out of step.
// `budget` (or null) carries what the Budget section shows — loading, hasBudget,
// amount, spent, percent — plus what setting one needs: `onSubmit`, last month's
// amount and spend, and `onSetupClosed` for the caller's own bookkeeping when the
// sheet closes. The sheet opens right here on the page, not by closing it first.
function WalletPage({ open, onClose, onClosed, budget, savings, budgetPlan, light = false, userId, slideX }) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Which section is showing. Deliberately survives closing and reopening
  // (this component stays mounted between opens), so it comes back where it
  // was left. Both sections stay mounted and crossfade rather than swapping,
  // so switching costs nothing.
  const [section, setSection] = useState('budget');
  const [detailGoalId, setDetailGoalId] = useState(null);
  const savingsUI = useSavingsUI();
  // Debt is a second, fully independent instance of the same goal-tracking
  // UI — its own sheet/confirm state and its own selected-item id, since
  // opening a loan's detail page has nothing to do with a savings goal's.
  const debtUI = useSavingsUI();
  const [detailDebtId, setDetailDebtId] = useState(null);

  // Switching Budget/Savings/Debt via the segmented control always lands on
  // that section's own goal/debt list, not wherever it was last left mid-
  // detail — landing back inside whichever goal happened to be open before
  // meant the switch itself no longer showed "all your goals," which is the
  // point of switching there in the first place. Reset both unconditionally
  // rather than only the section being left: it's just as wrong to land back
  // inside a goal's detail page when returning to a section as it is to
  // leave one open while away from it.
  const changeSection = useCallback((next) => {
    setDetailGoalId(null);
    setDetailDebtId(null);
    setSection(next);
  }, []);

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
  // Tapping an existing line opens the same sheet in edit mode — `editingItem`
  // is that line, or null while adding/closed. Only one of the two can be
  // open at a time in practice (they're separate taps on a modal sheet), but
  // closing always clears both so a stray state can't leave the other primed.
  const [editingItem, setEditingItem] = useState(null);
  const openEditItem = useCallback((item) => setEditingItem(item), []);
  const closeItemSheet = useCallback(() => { setAddItemOpen(false); setEditingItem(null); }, []);
  // Deleting a Budget Plan line asks first, same as every other delete in
  // the app (Home's own transaction delete, Savings/Debt's goal and entry
  // delete) — the dialog closes the instant "Delete" is tapped, and the
  // line itself is removed only once that close has actually finished (or
  // the backstop timer below fires, in case that event never comes), so its
  // removal is something seen happening rather than something that already
  // happened behind a dialog still on screen. `budgetPlan` is read through a
  // ref so `flushDeleteItem` doesn't need to change identity every time the
  // plan's own items change.
  const budgetPlanRef = useRef(budgetPlan);
  budgetPlanRef.current = budgetPlan;
  const [deleteItemTarget, setDeleteItemTarget] = useState(null);
  const pendingDeleteItemId = useRef(null);
  const requestDeleteItem = useCallback((id) => {
    const item = budgetPlanRef.current?.items.find(i => i.id === id);
    if (item) setDeleteItemTarget(item);
  }, []);
  const closeDeleteItem = useCallback(() => setDeleteItemTarget(null), []);
  const flushDeleteItem = useCallback(() => {
    const id = pendingDeleteItemId.current;
    pendingDeleteItemId.current = null;
    if (id) budgetPlanRef.current?.deleteItem(id);
  }, []);
  const confirmDeleteItem = useCallback(() => {
    if (!deleteItemTarget) return;
    pendingDeleteItemId.current = deleteItemTarget.id;
    setDeleteItemTarget(null);
    setTimeout(flushDeleteItem, DELETE_ITEM_BACKSTOP_MS);
  }, [deleteItemTarget, flushDeleteItem]);

  // A small bottom toast confirming a write to the real ledger actually
  // happened — a Budget Plan checkbox, or a debt payment's own "add to
  // transactions?" pill (see SavingsSheetsHost, which gets this passed down
  // as `showToast`) — not the top banner, OfflineBanner already owns that
  // spot. Self-timed: appears when the text is set, clears itself after a
  // fixed duration.
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
    // 80, matching ConfirmPill's own SLIDE_DISTANCE — the two slide the
    // same distance into the same bottom slot, so answering the pill reads
    // as it handing off to this toast rather than two unrelated slides.
    transform: [{ translateY: (1 - planToastProgress.value) * 80 }],
  }));
  const handleItemChecked = useCallback((checked, name) => {
    showPlanToast(checked ? `${name} added to your expenses` : `${name} expense removed`);
  }, [showPlanToast]);

  // Clearing the whole plan — the list's own reset now that nothing does
  // that automatically any more (see useBudgetPlan's own top comment). Asked
  // first, same as removing a single line above, but with no backstop timer
  // to delay it behind: a single line's own removal is watched happening (an
  // animated row sliding out from a list still on screen), so the dialog has
  // to actually be gone first or the two read as one jarring cut. Clearing
  // everything swaps the whole card over to "Nothing planned yet" in one go
  // — there's no row-by-row motion for the dialog's own close to step on, so
  // it can just run the moment "Clear" is tapped.
  const [clearListConfirmOpen, setClearListConfirmOpen] = useState(false);
  const requestClearList = useCallback(() => setClearListConfirmOpen(true), []);
  const closeClearListConfirm = useCallback(() => setClearListConfirmOpen(false), []);
  const confirmClearList = useCallback(() => {
    setClearListConfirmOpen(false);
    (async () => {
      const result = await budgetPlanRef.current?.clearList();
      if (result?.success) showPlanToast('Plan list cleared');
    })();
  }, [showPlanToast]);

  // Checking a Budget Plan line off no longer adds its expense straight
  // away — this holds the line between that tap and the confirm prompt
  // answering whether it should (see BudgetPlan's own comment on why). Only
  // two outcomes, both real (see ConfirmPill's own comment) — no separate
  // busy/error UI: the write runs in the background and the pill itself has
  // already closed by the time it settles, same as any other checkbox tap
  // elsewhere in the app.
  const [pendingPlanCheck, setPendingPlanCheck] = useState(null);
  const planCheckDelayRef = useRef(null);
  // The pill itself doesn't pop up the instant the checkbox is tapped — a
  // beat first, so it reads as a follow-up prompt rather than a jarring
  // interruption of the tap. Same reasoning and delay as SavingsSection's
  // own EMI confirm.
  const requestPlanCheck = useCallback((item) => {
    if (planCheckDelayRef.current) clearTimeout(planCheckDelayRef.current);
    planCheckDelayRef.current = setTimeout(() => setPendingPlanCheck(item), PLAN_CHECK_DELAY_MS);
  }, []);
  useEffect(() => () => { if (planCheckDelayRef.current) clearTimeout(planCheckDelayRef.current); }, []);
  const resolvePlanCheck = useCallback((addTransaction) => {
    if (!pendingPlanCheck) return;
    const item = pendingPlanCheck;
    setPendingPlanCheck(null);
    (async () => {
      const result = await budgetPlan.setChecked(item.id, true, { addTransaction });
      if (!result?.success) return;
      // A full second after the pill has closed, not right on top of it —
      // the two popups answering in immediate succession read as one
      // popup glitching into another rather than two separate beats.
      setTimeout(() => {
        showPlanToast(addTransaction ? `${item.name || 'Expense'} added to your expenses` : `${item.name || 'Line'} marked as paid`);
      }, 1000);
    })();
  }, [pendingPlanCheck, budgetPlan, showPlanToast]);
  const confirmPlanCheck = useCallback(() => resolvePlanCheck(true), [resolvePlanCheck]);
  const declinePlanCheck = useCallback(() => resolvePlanCheck(false), [resolvePlanCheck]);

  const closeBudgetSheet = useCallback(() => {
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
    if (pendingPlanCheck) { declinePlanCheck(); return; }
    if (deleteItemTarget) { closeDeleteItem(); return; }
    if (clearListConfirmOpen) { closeClearListConfirm(); return; }
    if (addItemOpen || editingItem) { closeItemSheet(); return; }
    if (confirmOpen) { closeConfirm(); return; }
    if (debtConfirmOpen) { closeDebtConfirm(); return; }
    if (sheetOpen) { closeSheet(); return; }
    if (debtSheetOpen) { closeDebtSheet(); return; }
    if (section === 'savings' && detailGoalId != null) { setDetailGoalId(null); return; }
    if (section === 'debt' && detailDebtId != null) { setDetailDebtId(null); return; }
    onClose();
  }, [
    budgetSheetOpen, closeBudgetSheet, pendingPlanCheck, declinePlanCheck, deleteItemTarget, closeDeleteItem, clearListConfirmOpen, closeClearListConfirm, addItemOpen, editingItem, closeItemSheet, confirmOpen, closeConfirm, debtConfirmOpen, closeDebtConfirm,
    sheetOpen, closeSheet, debtSheetOpen, closeDebtSheet, section, detailGoalId, detailDebtId, onClose,
  ]);

  // Slides in from the right (like a pushed page) rather than up from the
  // bottom — translateX/windowWidth, not translateY/windowHeight. No drag-
  // to-dismiss any more — the back button below is the only way to close
  // this now.
  const ownPageX = useSharedValue(windowWidth);
  const pageTranslateX = slideX ?? ownPageX;

  // Savings and Debt are each a full goal list plus their own add/edit
  // sheets — real native-view work to mount. This page used to be a native
  // <Modal>, which unmounts its entire child tree the moment it closes and
  // rebuilds it from scratch on the next open — every time, not just the
  // first. With three sections (one of them doubled: Savings and Debt are
  // both a complete goal-list page) that rebuild was heavy enough to
  // noticeably delay the wallet icon opening, going back out of it, and
  // switching to a tab for the first time after every single open — and an
  // earlier attempt to paper over it by deferring the mount to just after
  // the open animation only moved the collision onto the *close* animation
  // instead. Being a plain view that never gets torn down (see the switch
  // away from <Modal> below) fixes the actual cause: this only ever mounts
  // once, quietly, whenever the JS thread is next idle after Dashboard
  // itself has settled — not tied to any open/close/switch animation, so it
  // can no longer collide with one.
  const [contentReady, setContentReady] = useState(false);
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => setContentReady(true));
    return () => handle.cancel();
  }, []);

  useEffect(() => {
    if (open) {
      pageTranslateX.value = withTiming(0, { duration: WALLET_SLIDE_DURATION, easing: SETTLE_EASING });
    } else {
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
        { duration: WALLET_SLIDE_DURATION, easing: SETTLE_EASING },
        finished => {
          if (finished && onClosed) runOnJS(onClosed)();
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Replaces the native <Modal>'s own onRequestClose, which used to
  // intercept the Android hardware back button for free.
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [open, handleBack]);

  const pageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pageTranslateX.value }],
  }));

  return (
    // A plain absolutely-positioned overlay, not a native <Modal> — see
    // `contentReady`'s own comment above for why. Filling the screen at a
    // high zIndex over the rest of Dashboard does the same visual job
    // without a native Modal's forced unmount-on-close, and since this is no
    // longer its own separate native window, the root GestureHandlerRootView
    // and OfflineBanner (both in app/_layout.js) already reach it.
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: light ? '#FAFAF8' : '#000000', zIndex: 200, elevation: 200 },
        pageStyle,
      ]}
      pointerEvents={open ? 'auto' : 'none'}
    >
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
                <SegmentedSwitch options={SECTIONS} value={section} onChange={changeSection} buttonWidth={78} light={light} />
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
                {budget && <BudgetStatusBar {...budgetBar} onSetup={openBudgetSheet} light={light} />}

                {/* The space that heatmap left behind, now a plan for where
                    next month's money is going, written before the salary
                    that pays for it lands — see BudgetPlan.js. */}
                {budgetPlan && (
                  <View style={{ marginTop: 24 }}>
                    <BudgetPlan plan={budgetPlan} onAddPress={openAddItem} onEditItem={openEditItem} onItemChecked={handleItemChecked} onRequestCheck={requestPlanCheck} onRequestDeleteItem={requestDeleteItem} onRequestClear={requestClearList} light={light} />
                  </View>
                )}
            </ScrollView>

              </Animated.View>

              <Animated.View style={[StyleSheet.absoluteFill, savingsLayerStyle]} pointerEvents={section === 'savings' ? 'auto' : 'none'}>
                {/* Gated on `contentReady` (see its own comment above) — this
                    and Debt below are the two heaviest things this page
                    mounts. In the brief window before the background warm-up
                    finishes (effectively never, in practice, since it fires
                    on app idle rather than on open), switching here early
                    would land on an empty pane for a frame rather than
                    nothing opening at all. */}
                {contentReady && (
                  <SavingsBoundary light={light} onReset={closeGoal}>
                    <SavingsSection
                      savings={savings}
                      ui={savingsUI}
                      active={open && section === 'savings'}
                      light={light}
                      detailGoalId={detailGoalId}
                      onOpenGoal={openGoal}
                      onCloseGoal={closeGoal}
                      showToast={showPlanToast}
                    />
                  </SavingsBoundary>
                )}
              </Animated.View>

              <Animated.View style={[StyleSheet.absoluteFill, debtLayerStyle]} pointerEvents={section === 'debt' ? 'auto' : 'none'}>
                {contentReady && (
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
                      showToast={showPlanToast}
                    />
                  </SavingsBoundary>
                )}
              </Animated.View>
            </View>

            {/* Last child of the page, so its sheets slide up over everything
                above — header included. Deferred with their sections above:
                nothing can open one of these sheets before contentReady
                anyway, since that's gated on the goal row that opens it. */}
            {contentReady && (
              <>
                <ErrorBoundary
                  resetKeys={[savingsUI.sheetData, savingsUI.confirmData]}
                  onError={() => { savingsUI.closeSheet(); savingsUI.closeConfirm(); }}
                >
                  <SavingsSheetsHost savings={savings} ui={savingsUI} light={light} showToast={showPlanToast} />
                </ErrorBoundary>
                <ErrorBoundary
                  resetKeys={[debtUI.sheetData, debtUI.confirmData]}
                  onError={() => { debtUI.closeSheet(); debtUI.closeConfirm(); }}
                >
                  <SavingsSheetsHost savings={savings} ui={debtUI} light={light} kind="debt" showToast={showPlanToast} />
                </ErrorBoundary>
              </>
            )}

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

            {/* Budget Plan's own add/edit popup — same overlay treatment as
                the budget-setup sheet just above. One sheet serves both:
                `editingItem` set means a tap on an existing line, not the +
                button. */}
            {budgetPlan && (
              <ErrorBoundary resetKeys={[addItemOpen, editingItem]} onError={closeItemSheet}>
                <AddBudgetItemSheet
                  open={addItemOpen || !!editingItem}
                  onClose={closeItemSheet}
                  onAdd={budgetPlan.addItem}
                  onEdit={budgetPlan.updateItem}
                  editItem={editingItem}
                  light={light}
                />
              </ErrorBoundary>
            )}

            {/* Asked the moment a plan line is checked off, before it
                becomes a real expense — checking it still marks it paid
                either way, the X just skips the transaction (see
                BudgetPlan's own comment on why). Rendered inline rather
                than a real Modal for the same reason the savings/debt
                confirms are — this page is already one. */}
            {budgetPlan && (
              <ErrorBoundary resetKeys={[pendingPlanCheck]} onError={() => setPendingPlanCheck(null)}>
                <ConfirmPill
                  open={!!pendingPlanCheck}
                  message={`Add ${formatCurrency(pendingPlanCheck?.amount || 0)} for ${pendingPlanCheck?.name || 'this'} as expense`}
                  onConfirm={confirmPlanCheck}
                  onDecline={declinePlanCheck}
                  light={light}
                />
              </ErrorBoundary>
            )}

            {/* Asked before a Budget Plan line is actually removed — same
                delete confirmation as every other list in the app (see
                requestDeleteItem's own comment on why). */}
            {budgetPlan && (
              <ErrorBoundary resetKeys={[deleteItemTarget]} onError={() => setDeleteItemTarget(null)}>
                <InlineConfirm
                  open={!!deleteItemTarget}
                  title="Delete line?"
                  message={`${deleteItemTarget?.name || 'This line'}${deleteItemTarget?.amount ? ` (${formatCurrency(deleteItemTarget.amount)})` : ''} will be removed from your plan.`}
                  onConfirm={confirmDeleteItem}
                  onCancel={closeDeleteItem}
                  onClosed={flushDeleteItem}
                  light={light}
                />
              </ErrorBoundary>
            )}

            {/* "Clear list" asks before wiping the whole plan — same
                destructive-action confirm as a single line's own delete just
                above, just for everything at once. */}
            {budgetPlan && (
              <ErrorBoundary resetKeys={[clearListConfirmOpen]} onError={() => setClearListConfirmOpen(false)}>
                <InlineConfirm
                  open={clearListConfirmOpen}
                  title="Clear plan list?"
                  message="Every line will be removed, including any already marked paid. This can't be undone."
                  confirmLabel="Clear"
                  onConfirm={confirmClearList}
                  onCancel={closeClearListConfirm}
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

        </View>
    </Animated.View>
  );
}

export default memo(WalletPage);
