import { memo, useCallback, useState, useEffect, useRef } from 'react';
import { Modal, View, Text, TextInput, Pressable, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS, Easing } from 'react-native-reanimated';
import { today, formatDayLabel } from '../utils/format';
import CalendarPicker from './CalendarPicker';
import { GlassPressable, INPUT_TEXT_STYLE, POPUP_RADIUS, SMOOTH } from './Glass';
import { NumericKeypad } from './NumericKeypad';
import { useAmountEntry } from '../hooks/useAmountEntry';
import { AmountRow } from './AmountField';
import { useShake } from '../hooks/useShake';
import { hapticHeavy } from '../utils/haptics';
import { CalendarIcon } from './icons';
import { textColor, INCOME_TEXT } from '../utils/colors';

// Height of the description pill. Shared by the pill itself, the input
// inside it and the placeholder overlay on top, so all three are centring
// text within the exact same box — see the comment at the pill's render.
const DESCRIPTION_PILL_H = 40;

// The sheet covers most, not all, of the screen — a real bottom sheet with
// a dimmed backdrop above it, rather than a full-screen takeover. Shorter
// than v1's 0.855: amount and description now share one compact row
// instead of a 72pt hero amount with its own separate description pill
// 40px below it, so there's meaningfully less content to leave room for
// above the keypad.
const SHEET_HEIGHT_RATIO = 0.72;
// Backdrop opacity while open — a soft dark tint, not pure black.
const BACKDROP_MAX_OPACITY = 0.55;
// Plain, fixed slide — same shape both ways as the calendar's own slide
// (Easing.out on the way in, Easing.inOut on the way out), just scaled up
// for the much longer distance this sheet travels versus the calendar's
// ~420px. A drag-dismiss's release animates with these same two constants
// too, not its own velocity-based curve — one consistent slide, always.
const OPEN_DURATION = 560;
const OPEN_EASING = Easing.out(Easing.cubic);
const CLOSE_DURATION = 500;
const CLOSE_EASING = Easing.inOut(Easing.cubic);
// Same duration as a tapped close, different curve. A tapped close starts
// from a dead stop, so easing *in* is right there. A drag-release doesn't:
// the finger was still moving when it lifted, and inOut's zero starting
// velocity reads as the sheet braking hard the instant you let go before
// taking off again. Easing.out puts its fastest moment at t=0, so the
// slide picks up where the finger left off instead of restarting from rest.
const DRAG_CLOSE_EASING = Easing.out(Easing.cubic);
// How far (px) or how fast (px/s) a downward drag needs to go before it
// counts as "dismiss" rather than snapping back open.
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;

// `light` is a one-off experimental prop for trying a light theme on just
// the Dashboard (and the flows it opens) — see the matching comment in
// Header.js. Callers outside the Dashboard keep passing nothing.
// v2 — same sheet, gestures, keyboard/calendar handling and submit flow as
// v1 (AddModal.js, kept as-is and still what the app actually uses), only
// the type selector and the amount/description layout differ. See the two
// render-time comments below for what changed and why; everything else in
// this file is an unmodified copy.
function AddModalV2({ open, onClose, onClosed, onAdd, onEdit, editData, light = false }) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const isEdit = !!editData;
  const [type, setType] = useState('expense');
  const { amount, prevAmountLength, skipDigitAnim, onKeyPress: handleKeypadPress, setProgrammatic: setAmountProgrammatically } = useAmountEntry();
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState('');
  const [calOpen, setCalOpen] = useState(false);
  // Mirrors `visible` on the outer sheet — stays mounted through its own
  // close animation instead of vanishing the instant calOpen flips false.
  const [calendarVisible, setCalendarVisible] = useState(false);
  // Measured from the CTA+keypad wrapper's onLayout — lets the calendar
  // overlay's minHeight guarantee full coverage without hardcoding a
  // number that drifts if that row/keypad's own sizing ever changes.
  const [ctaKeypadHeight, setCtaKeypadHeight] = useState(0);
  const calendarProgress = useSharedValue(0);
  useEffect(() => {
    // SETTLE_EASING (fast-start) compressed nearly all the motion into the
    // first ~30% of the duration — read as "fade in place, then a quick
    // jump" instead of a sustained slide. A plain smooth deceleration
    // spreads the motion across the whole duration instead.
    if (calOpen) {
      setCalendarVisible(true);
      calendarProgress.value = withTiming(1, { duration: 480, easing: Easing.out(Easing.cubic) });
    } else if (calendarVisible) {
      calendarProgress.value = withTiming(0, { duration: 480, easing: Easing.inOut(Easing.cubic) }, finished => {
        if (finished) runOnJS(setCalendarVisible)(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calOpen]);
  // A fixed slide distance, not a measured card height — this reads as a
  // convincing "slides up from the bottom" regardless of how tall the
  // calendar ends up being for a given month's row count. The keypad and
  // CTA row underneath never react to this at all — this overlay covers
  // them by stacking on top, not by coordinating with them.
  const calendarCardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - calendarProgress.value) * 420 }],
  }));
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // The CTA stays enabled at all times now (no disabled/greyed-out state) —
  // an invalid submit attempt shakes whichever field(s) are actually
  // missing instead, so the button always looks tappable and the feedback
  // points at exactly what needs fixing. No color change — the existing
  // "0" / "What was this for?" placeholder content already says the field
  // is empty; the shake is just what draws the eye to it.
  const amountShake = useShake();
  const descriptionShake = useShake();
  // Stable reference — CalendarPicker is memo()-wrapped, and AddModal
  // re-renders on every keystroke in the amount/description fields, so an
  // inline arrow here would defeat that memo the whole time the calendar
  // overlay is open.
  const closeCalendar = useCallback(() => setCalOpen(false), []);

  // RN's built-in Modal animationType only animates the WHOLE modal content
  // as one transform — managed independently here instead so `visible`
  // stays mounted through the close animation and it can actually play.
  const [visible, setVisible] = useState(open);
  // The sheet's one and only vertical offset — driven either by a live
  // drag gesture or by a programmatic open/close withTiming, never both at
  // once through separate values reconciled into each other (that hazard,
  // and the ScrollView/gesture contention below, were the actual causes of
  // the stutter chased through this file earlier — not the curve).
  const translateY = useSharedValue(windowHeight);
  // Snapshot of translateY at the moment a drag gesture starts, so onUpdate
  // can apply the finger's movement as an offset from wherever the sheet
  // actually is, not assume it starts at 0.
  const dragStartY = useSharedValue(0);

  // Mirrors `submitting` on the UI thread — the drag gesture below runs as
  // a worklet and can't read React state directly. Without this, a fast
  // drag-dismiss started right after tapping Save closes the sheet (and
  // eventually unmounts it) while onAdd/onEdit is still in flight; when
  // that promise resolves, its result lands on a component that's already
  // gone, silently losing a real failure.
  const submittingSV = useSharedValue(false);
  useEffect(() => { submittingSV.value = submitting; }, [submitting]);

  // Defense-in-depth: if the sheet somehow gets closed and reopened while a
  // submit is in flight (e.g. the Android hardware back button, which
  // bypasses the drag gesture's own guard above), this tells a stale
  // submit's eventual result apart from the fresh session that's now open.
  const sessionRef = useRef(0);
  useEffect(() => { if (open) sessionRef.current += 1; }, [open]);

  // Set (from the pan gesture's worklet, via runOnJS) the instant a
  // drag-dismiss starts its own close animation — lets the `open`-driven
  // effect below know not to start a *second* one once React catches up
  // and this prop actually flips to false.
  const closingViaDragRef = useRef(false);
  const markClosingViaDrag = useCallback(() => { closingViaDragRef.current = true; }, []);

  // Tapping the date field while the description input still has the
  // native keyboard up used to open the calendar overlay right on top of
  // it, both animating at once. First tap now just dismisses the keyboard;
  // the calendar only opens once it's no longer focused — the same date
  // field, a second tap.
  const descriptionInputRef = useRef(null);
  // A targeted blur on the specific input, not the global Keyboard.dismiss()
  // — that was tried first for the drag-close case below and caused the
  // whole app to quit on some devices (Android's dismiss path can synthesize
  // a back-press, and with nothing else on the native back stack that exits
  // the app instead of just closing the keyboard). Blurring the ref directly
  // never touches that path.
  const blurDescriptionInput = useCallback(() => {
    if (descriptionInputRef.current?.isFocused()) descriptionInputRef.current.blur();
  }, []);

  useEffect(() => {
    if (open) {
      setVisible(true);
      closingViaDragRef.current = false;
      translateY.value = withTiming(0, { duration: OPEN_DURATION, easing: OPEN_EASING });
    } else if (!closingViaDragRef.current) {
      translateY.value = withTiming(
        windowHeight,
        { duration: CLOSE_DURATION, easing: CLOSE_EASING },
        finished => {
          if (!finished) return;
          runOnJS(setVisible)(false);
          // Lets callers know the native <Modal> is actually gone before
          // presenting a different one (e.g. an auto-popup right after
          // adding a transaction) — two native Modals mounted at once is
          // broken on Android.
          if (onClosed) runOnJS(onClosed)();
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) {
      if (editData) {
        setType(editData.type);
        setAmountProgrammatically(String(editData.amount));
        setDate(editData.date);
        setDescription(editData.description);
      } else {
        setType('expense');
        setAmountProgrammatically('');
        setDate(today());
        setDescription('');
      }
      setCalOpen(false);
      setError('');
      // Without this, a successful add left `submitting` permanently true
      // (see handleSubmit below) — the next time the sheet opened fresh,
      // the button stayed disabled forever.
      setSubmitting(false);
    }
  }, [open, editData]);

  async function handleSubmit() {
    // Belt-and-suspenders alongside the button's own `disabled` prop — see
    // login.js's identical guard for why: React's state update isn't
    // synchronous, so a fast double-tap could otherwise fire this twice
    // before `submitting` re-renders the button disabled, inserting the
    // same transaction twice.
    if (submitting) return;
    const val = parseFloat(amount);
    const amountInvalid = !val || val <= 0;
    const descriptionInvalid = !description.trim();
    if (amountInvalid || descriptionInvalid) {
      if (amountInvalid) amountShake.shake();
      if (descriptionInvalid) descriptionShake.shake();
      return;
    }
    const mySession = sessionRef.current;
    setSubmitting(true);
    setError('');
    const result = isEdit
      ? await onEdit(editData.id, { type, amount: val, date, description })
      : await onAdd({ type, amount: val, date, description });
    // The sheet was closed and reopened while this was in flight (drag-
    // dismiss is blocked while submitting, but the Android back button's
    // onRequestClose isn't) — this result belongs to a session the user
    // can no longer see; applying it now would show a stale error, or
    // silently close a fresh session they're actively looking at.
    if (sessionRef.current !== mySession) return;
    // On success, `submitting` deliberately stays true instead of flipping
    // back to false — resetting it here shows "Update"/"Add" again for the
    // render(s) before the close animation actually finishes, a visible
    // flicker back to the pre-submit label right before the modal vanishes.
    // The reset effect above clears it the next time the sheet opens fresh.
    if (result?.success === false) {
      setSubmitting(false);
      setError(result.error || 'Something went wrong. Please try again.');
      return;
    }
    // Heavy, for both add and edit — see hapticHeavy.
    hapticHeavy();
    onClose();
  }

  function handleRequestClose() {
    if (submitting) return;
    onClose();
  }

  // Drag-to-dismiss from anywhere on the sheet — the grabber, the blank
  // space around the amount/toggle, the CTA row's gap between Date and
  // Save, the keypad's own gaps between keys. Scoping this to *only* the
  // grabber handle was tried and made most of the sheet undraggable, which
  // is a worse trade than the actual remaining issue: starting a drag
  // exactly on a keypad key or the Save button (a plain RN Pressable, not
  // RNGH) can briefly contest ownership of that touch with this gesture
  // right as it crosses its activation threshold — a narrower, rarer case
  // than "can't drag from most of the sheet". activeOffsetY/failOffsetY
  // are what keep it safe to wrap this widely without stealing normal
  // taps: it only activates once a touch has clearly moved down (12px),
  // and fails itself if the touch moves up first.
  const pan = Gesture.Pan()
    .activeOffsetY(12)
    .failOffsetY(-12)
    .onStart(() => {
      dragStartY.value = translateY.value;
    })
    .onUpdate(e => {
      translateY.value = Math.max(0, dragStartY.value + e.translationY);
    })
    .onEnd(e => {
      const pastThreshold = e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY;
      if (pastThreshold && !submittingSV.value) {
        // Start the close animation *right here* rather than only setting
        // a static value and waiting for `onClose` to round-trip through
        // React state back down as the `open` prop — that round-trip takes
        // a frame or two with nothing animating, a visible freeze mid-close.
        runOnJS(markClosingViaDrag)();
        runOnJS(blurDescriptionInput)();
        translateY.value = withTiming(
          windowHeight,
          { duration: CLOSE_DURATION, easing: DRAG_CLOSE_EASING },
          finished => {
            if (!finished) return;
            runOnJS(setVisible)(false);
            // onClose fires HERE, not the instant the drag ends — this is
            // what the "stalls partway through the slide" bug actually
            // was. Calling it up front flips `open` in the parent, and
            // that re-render's native view commit lands on the UI thread
            // one or two frames into this animation, competing with it for
            // the same thread and dropping frames right at the start.
            // Tapping to close never had the problem because there the
            // commit happens *first* and the effect starts the animation
            // afterwards — the exact asymmetry that made this look like an
            // easing bug for so long. Deferring it to here keeps the whole
            // slide on an otherwise-idle UI thread.
            runOnJS(onClose)();
            if (onClosed) runOnJS(onClosed)();
          },
        );
      } else {
        // Snap back open with the same curve/duration open itself uses —
        // one consistent slide, whichever direction it ends up going.
        translateY.value = withTiming(0, { duration: OPEN_DURATION, easing: OPEN_EASING });
      }
    });

  const pageStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Fades with the exact same slide progress as the sheet, capped at
  // BACKDROP_MAX_OPACITY (a soft dark tint, not pure black) — no real blur
  // here (see Glass.js's own note on why BlurView was removed from this
  // app: muddy/inconsistent on Android's software-rendered blur path).
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: (1 - Math.min(1, Math.max(0, translateY.value / windowHeight))) * BACKDROP_MAX_OPACITY,
  }));

  // Unmount the whole tree while closed instead of just hiding it behind
  // Modal's own visible=false — left mounted, all of this stays in the React
  // tree and keeps re-rendering on every unrelated Dashboard state change.
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleRequestClose}>
      {/* RN's <Modal> renders its content in its own separate native view
          hierarchy (a distinct window on iOS) — the GestureHandlerRootView
          set up once at the app's root (app/_layout.js) doesn't extend
          into it. Without a second one in here, react-native-gesture-
          handler's Gesture.Pan below recognizes unreliably: it's the
          documented cause of exactly the "drag starts fine, stalls
          partway, then catches up" glitch chased through this file, and
          why the backdrop's plain Pressable onPress (the old RN touch
          responder, not RNGH) was never affected by it. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {/* Dimmed backdrop above the sheet — only needed now that the sheet
            covers part of the screen rather than all of it. Tapping it
            dismisses. */}
        <Animated.View pointerEvents={open ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { backgroundColor: '#000000' }, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleRequestClose} />
        </Animated.View>

        {/* RN's <Modal> stays fully touch-active for its whole lifetime —
            `visible` only flips to false once the close animation has
            actually finished, so without this the FAB underneath (and
            anything else on Dashboard) would be unreachable for the whole
            ~500ms the content spends sliding off-screen. Keyed off `open`,
            which for a tapped close flips false the instant the close
            starts, so touches fall through immediately rather than at the
            end. A drag-dismiss is the one case where `open` instead flips
            at the *end* of the slide (see the pan gesture's onEnd) — the
            sheet is still visibly on screen for that whole window there,
            so there's no invisible-but-blocking gap either way. */}
        <Animated.View
          style={[
            {
              position: 'absolute', left: 0, right: 0, bottom: 0,
              height: windowHeight * SHEET_HEIGHT_RATIO,
              // A step lighter than the app's own near-black background —
              // reads as the sheet sitting slightly elevated above the
              // backdrop instead of blending into it.
              backgroundColor: light ? '#FAFAF8' : '#161616',
              borderTopLeftRadius: POPUP_RADIUS, borderTopRightRadius: POPUP_RADIUS, ...SMOOTH,
              overflow: 'hidden',
            },
            pageStyle,
          ]}
          pointerEvents={open ? 'auto' : 'none'}
        >
      <View style={{ flex: 1 }}>
      {/* Drag-to-dismiss wraps the grabber + ScrollView content only, not
          the CTA row/keypad below (see the sibling View after this one) —
          starting a drag exactly on a keypad key or the Save button (a
          plain RN Pressable, not RNGH) briefly contests ownership of that
          touch with this gesture right as it crosses its activation
          threshold, which is what the "freezes partway through" glitch
          turned out to be. Excluding just those controls (not the whole
          sheet, which broke dragging from everywhere else) keeps the
          grabber, the blank space around the amount/toggle, and the
          ScrollView's own gaps all draggable. */}
      <GestureDetector gesture={pan}>
      <View>
        <View style={{ paddingTop: 10, paddingBottom: 24, alignItems: 'center' }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: light ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)' }} />
        </View>

        {/* No flex:1 here — fixed margins around the amount below keep
            Date/Amount/Description close together instead of spread
            across however much space the device happens to have. */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
          bounces={false}
          overScrollMode="never"
        >
          {/* v2: plain words, no sliding pill. The active one is bold and
              full-strength; whichever isn't picked just sits dim beside it.
              Income gets the same green a real income row/amount uses
              elsewhere in the app when it's the active one — Expense stays
              neutral white/bold, matching how an expense amount already
              reads everywhere else (no colour of its own, income is the
              one that gets one). Tapping either just sets `type`, same
              state this always used — only the control drawing it changed. */}
          <View className="flex-row items-center justify-center" style={{ gap: 20, marginBottom: 28 }}>
            {['expense', 'income'].map(t => {
              const active = type === t;
              const activeColor = t === 'income' ? INCOME_TEXT : (light ? '#111111' : '#ffffff');
              return (
                <Pressable key={t} onPress={() => setType(t)} hitSlop={8}>
                  <Text
                    className="text-lg"
                    style={{
                      fontWeight: active ? '600' : '400',
                      color: active ? activeColor : textColor(light).disabled,
                    }}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* v2: amount and description share one row instead of the amount
              sitting alone (72pt, its own hero moment) with description
              40px below it. AmountRow shrinks to content width on its own
              (see its own comment — no flex:1), so it sits to the left at
              a size that still reads at a glance, and the description pill
              takes whatever's left rather than centring itself under a
              fixed min-width. */}
          <View className="flex-row items-center" style={{ marginBottom: 24, gap: 14 }}>
            <Animated.View style={amountShake.style}>
              <AmountRow
                amount={amount}
                prevAmountLength={prevAmountLength}
                skipDigitAnim={skipDigitAnim}
                light={light}
                digitFontSize={34}
                lineHeight={40}
                zeroColor={light ? 'rgba(0,0,0,0.82)' : 'rgba(255,255,255,0.82)'}
                weight="500"
              />
            </Animated.View>

            {/* Flex:1 pill filling the rest of the row — same reasoning as
                v1's pill on height/centring (see its own comment, unchanged
                here), just no longer self-centred at a fixed min-width. */}
            <View
              style={{
                flex: 1, height: DESCRIPTION_PILL_H,
                borderRadius: 9999, justifyContent: 'center',
                backgroundColor: light ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.15)',
                borderWidth: 1, borderColor: light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.07)',
              }}
            >
              <Animated.View style={descriptionShake.style}>
                <TextInput
                  ref={descriptionInputRef}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Description"
                  placeholderTextColor={light ? '#b0b0b0' : '#4d4d4d'}
                  maxLength={140}
                  className="px-4 text-base"
                  style={[
                    INPUT_TEXT_STYLE,
                    {
                      color: light ? '#111111' : '#ffffff',
                      height: DESCRIPTION_PILL_H,
                      paddingVertical: 0,
                    },
                  ]}
                />
              </Animated.View>
            </View>
          </View>
        </ScrollView>
      </View>
      </GestureDetector>

        {!!error && <Text className="text-red-400 text-base text-center mx-5 mb-3">{error}</Text>}
        {/* Wraps the CTA row + keypad so the calendar overlay below can
            measure this wrapper's real height and use it as a minHeight —
            otherwise the calendar (bottom-anchored, sized to its own
            content) is shorter than the CTA+keypad on months with fewer
            week rows, leaving the keypad's top rows poking out above it. */}
        {/* marginTop:auto pins this block to the bottom of the sheet. Nothing
            above it has flex:1 (the ScrollView deliberately doesn't — see its
            own comment), so without this the whole column is top-packed and
            whatever height the sheet has spare falls below the keypad. That
            gap is also what the calendar overlay inherits: it's absolutely
            positioned against THIS wrapper, so its bottom:0 was the wrapper's
            bottom rather than the screen's. Content above stays tight and
            top-aligned exactly as before. */}
        <View style={{ marginTop: 'auto' }} onLayout={e => setCtaKeypadHeight(e.nativeEvent.layout.height)}>
          {/* Date, sharing a row with the submit CTA — right above the
              keypad. Always rendered exactly as-is, untouched by the
              calendar — it doesn't move, fade, or hide; the calendar is a
              fully independent overlay that slides up and visually covers
              this and the keypad below, not something these react to. */}
          <View className="flex-row items-center justify-between" style={{ paddingHorizontal: 32, paddingBottom: 20 }}>
            <Pressable
              onPress={() => {
                if (descriptionInputRef.current?.isFocused()) {
                  descriptionInputRef.current.blur();
                  return;
                }
                setCalOpen(true);
              }}
              className="flex-row items-center"
            >
              <CalendarIcon color={light ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)'} />
              <Text className="text-[15px] ml-1.5" style={{ color: light ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)' }}>
                {formatDayLabel(date)}
              </Text>
            </Pressable>

            <GlassPressable
              variant="active"
              radius={9999}
              disabled={submitting}
              onPress={handleSubmit}
              className="px-8 py-3 items-center"
            >
              <Text className="text-black text-[15px] font-semibold">
                {isEdit ? 'Update' : 'Save'}
              </Text>
            </GlassPressable>
          </View>

          <NumericKeypad onKeyPress={handleKeypadPress} insetBottom={insets.bottom} light={light} />

          {/* Tap-outside-to-dismiss — a plain, unanimated catcher behind
              the calendar covering the whole wrapper, so touching
              anywhere else on screen — including up in the amount/
              description area above this wrapper — closes it. `top: -1000`
              stretches it past the wrapper's own bounds to cover the
              whole sheet; the sheet's own overflow:hidden clips it back
              down to the visible area. The calendar itself renders after
              this (same stacking context, higher zIndex), so it still
              gets its own taps first. */}
          {calendarVisible && (
            <Pressable
              style={{ position: 'absolute', top: -1000, left: 0, right: 0, bottom: 0, zIndex: 10, elevation: 10 }}
              onPress={closeCalendar}
            />
          )}

          {/* Independent overlay — bottom-anchored, sized to its own
              content height by default (no empty band of background above
              it), but with a measured minHeight so it can never end up
              shorter than the CTA+keypad box it needs to cover, whatever
              the current month's row count. They stay mounted and
              unmoved underneath the whole time. */}
          {calendarVisible && (
            <Animated.View
              style={[
                {
                  position: 'absolute', left: 0, right: 0, bottom: 0,
                  minHeight: ctaKeypadHeight,
                  zIndex: 20, elevation: 20,
                  overflow: 'hidden',
                  paddingTop: 16,
                  paddingBottom: insets.bottom + 10,
                  // Same tint as the description pill (rgba(0,0,0,0.15/0.05))
                  // but composited to an OPAQUE solid here — a translucent
                  // layer over the keypad/CTA let them bleed through as
                  // ghost text once this became a full covering overlay,
                  // instead of the small pill-on-opaque-sheet look it was
                  // copied from.
                  backgroundColor: light ? '#EDEDEC' : '#131313',
                  borderTopLeftRadius: 24, borderTopRightRadius: 24,
                },
                calendarCardStyle,
              ]}
            >
              <CalendarPicker value={date} onChange={setDate} onClose={closeCalendar} light={light} />
            </Animated.View>
          )}
        </View>
      </View>
      </Animated.View>
      </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

export default memo(AddModalV2);
