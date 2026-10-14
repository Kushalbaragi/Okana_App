import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, InteractionManager, View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS, Easing } from 'react-native-reanimated';
import { BackIcon } from './icons';
import SegmentedSwitch from './SegmentedSwitch';
import SavingsSection, { SavingsSheetsHost, useSavingsUI } from './SavingsSection';
import SavingsBoundary from './SavingsBoundary';
import ErrorBoundary from './ErrorBoundary';
import { SETTLE_EASING } from '../utils/motion';
import { FONT } from '../utils/type';

// The page has two sections, switched from the header: savings goals, and debt
// (loans tracked the same way as a savings goal, just paid down instead of built
// up — see savingsShared.js's KIND_COPY and useSavings.js's own comment on how one
// goal shape covers both). The budget lives on Home now, under the amount.
const SECTIONS = [
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
// `light` is a one-off experimental prop for trying a light theme on just
// the Dashboard (and the flows it opens) — see the matching comment in
// Header.js.
// `slideX` (optional) is a shared value this page keeps at its own horizontal
// position: full width while closed, 0 once it has slid in. Whoever passes one can
// read it to move in step with the page — Home uses it for its parallax. It is the
// page's own value rather than a second animation started elsewhere, so the two
// can never fall out of step.
function WalletPage({ open, onClose, onClosed, savings, light = false, userId, slideX, locked = false, onLocked }) {
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Which section is showing. Deliberately survives closing and reopening
  // (this component stays mounted between opens), so it comes back where it
  // was left. Both sections stay mounted and crossfade rather than swapping,
  // so switching costs nothing.
  const [section, setSection] = useState('savings');
  const [detailGoalId, setDetailGoalId] = useState(null);
  // `locked` is an account with no access to add new things (trial over, or
  // never started): a new goal or loan asks for a subscription
  // instead, while logging money against a goal or loan that already exists
  // is left alone.
  const savingsUI = useSavingsUI({ locked, onLocked });
  // Debt is a second, fully independent instance of the same goal-tracking
  // UI — its own sheet/confirm state and its own selected-item id, since
  // opening a loan's detail page has nothing to do with a savings goal's.
  const debtUI = useSavingsUI({ locked, onLocked });
  const [detailDebtId, setDetailDebtId] = useState(null);

  // Switching Savings/Debt via the segmented control always lands on
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

  // One opacity per section — each animates toward 1 when it's the active
  // section and 0 otherwise, same duration/easing for both, so the crossfade
  // reads identically whichever way it is swapping.
  const savingsProgress = useSharedValue(1);
  const debtProgress = useSharedValue(0);
  useEffect(() => {
    const opts = { duration: SECTION_FADE_MS, easing: Easing.out(Easing.cubic) };
    savingsProgress.value = withTiming(section === 'savings' ? 1 : 0, opts);
    debtProgress.value = withTiming(section === 'debt' ? 1 : 0, opts);
  }, [section, savingsProgress, debtProgress]);
  const savingsLayerStyle = useAnimatedStyle(() => ({ opacity: savingsProgress.value }));
  const debtLayerStyle = useAnimatedStyle(() => ({ opacity: debtProgress.value }));

  // A small bottom toast confirming a write to the real ledger actually
  // happened — a debt or savings entry's own "add to transactions?" pill (see
  // SavingsSheetsHost, which gets this passed down as `showToast`) — not the top
  // banner, OfflineBanner already owns that spot. Self-timed: appears when the text is set, clears itself after a
  // fixed duration.
  const [toastText, setToastText] = useState(null);
  const toastProgress = useSharedValue(0);
  const toastTimerRef = useRef(null);
  const showToast = useCallback((text) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastText(text);
    toastProgress.value = withTiming(1, { duration: 480, easing: SETTLE_EASING });
    toastTimerRef.current = setTimeout(() => {
      toastProgress.value = withTiming(0, { duration: 420, easing: Easing.in(Easing.cubic) }, finished => {
        if (finished) runOnJS(setToastText)(null);
      });
    }, 1800);
  }, [toastProgress]);
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);
  const toastStyle = useAnimatedStyle(() => ({
    opacity: toastProgress.value,
    // 80, matching ConfirmPill's own SLIDE_DISTANCE — the two slide the
    // same distance into the same bottom slot, so answering the pill reads
    // as it handing off to this toast rather than two unrelated slides.
    transform: [{ translateY: (1 - toastProgress.value) * 80 }],
  }));
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
    if (confirmOpen) { closeConfirm(); return; }
    if (debtConfirmOpen) { closeDebtConfirm(); return; }
    if (sheetOpen) { closeSheet(); return; }
    if (debtSheetOpen) { closeDebtSheet(); return; }
    if (section === 'savings' && detailGoalId != null) { setDetailGoalId(null); return; }
    if (section === 'debt' && detailDebtId != null) { setDetailDebtId(null); return; }
    onClose();
  }, [
    confirmOpen, closeConfirm, debtConfirmOpen, closeDebtConfirm,
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
                  of px taller) can't push everything below it down. */}
              <View style={{ flex: 1, height: 36, alignItems: 'center', justifyContent: 'center' }}>
                <SegmentedSwitch options={SECTIONS} value={section} onChange={changeSection} buttonWidth={92} light={light} />
              </View>
              <View style={{ width: 36 }} />
            </View>

            {/* Both sections fill the space under the header and crossfade;
                only the visible one takes touches. */}
            <View style={{ flex: 1 }}>
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
                      showToast={showToast}
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
                      showToast={showToast}
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
                  <SavingsSheetsHost savings={savings} ui={savingsUI} light={light} showToast={showToast} />
                </ErrorBoundary>
                <ErrorBoundary
                  resetKeys={[debtUI.sheetData, debtUI.confirmData]}
                  onError={() => { debtUI.closeSheet(); debtUI.closeConfirm(); }}
                >
                  <SavingsSheetsHost savings={savings} ui={debtUI} light={light} kind="debt" showToast={showToast} />
                </ErrorBoundary>
              </>
            )}

            {/* The toast (see above) — a bottom pill, out of OfflineBanner's way at
                the top. */}
            {!!toastText && (
              <Animated.View
                pointerEvents="none"
                style={[{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 24, alignItems: 'center', zIndex: 90 }, toastStyle]}
              >
                <View
                  style={{
                    maxWidth: '85%', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 9999,
                    backgroundColor: light ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.92)',
                  }}
                >
                  <Text numberOfLines={1} style={{ color: light ? '#ffffff' : '#111111', fontSize: FONT.caption, fontWeight: '600' }}>{toastText}</Text>
                </View>
              </Animated.View>
            )}

        </View>
    </Animated.View>
  );
}

export default memo(WalletPage);
