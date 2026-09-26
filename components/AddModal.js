import { memo, useCallback, useState, useEffect, useRef } from 'react';
import { Modal, View, Text, TextInput, Pressable, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring, runOnJS, Easing } from 'react-native-reanimated';
import { today, formatDayLabel } from '../utils/format';
import CalendarPicker from './CalendarPicker';
import { GlassPressable, INPUT_TEXT_STYLE, POPUP_RADIUS, SMOOTH } from './Glass';
import { NumericKeypad } from './NumericKeypad';
import { useAmountEntry } from '../hooks/useAmountEntry';
import { AmountRow } from './AmountField';
import { useShake } from '../hooks/useShake';
import { hapticHeavy } from '../utils/haptics';
import { SPRING_SMOOTH } from '../utils/motion';
import { CalendarIcon } from './icons';
import { textColor } from '../utils/colors';

// Height of the description field. Shared by its wrapper and the input
// inside it, so both are centring text within the exact same box.
const DESCRIPTION_FIELD_H = 40;

// The sheet covers most, not all, of the screen — a real bottom sheet with
// a dimmed backdrop above it, rather than a full-screen takeover. Brought
// down from 0.855 — the description field losing its own pill (see
// DESCRIPTION_FIELD_H's own comment), the smaller amount digits, and the
// tighter margins around both freed up enough vertical space that the
// sheet no longer needed quite this much height to feel balanced.
// NumericKeypad is fixed-height (4 rows, doesn't shrink to fit — see its
// own comment), so this can't drop further than the space actually freed
// up above it without clipping the keypad's bottom row against the
// sheet's own overflow:hidden — 0.75 dropped too far on its own before
// the amount/description got smaller too; this matches what those
// changes actually saved.
const SHEET_HEIGHT_RATIO = 0.75;
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

// Same sliding-reel-under-a-fixed-window design as the Home header's own
// Expense/Income/Overview switch (see ModeSlider/DimReel in Header.js) —
// two slots instead of three, otherwise an unmodified copy of that same
// look: a dim, always-visible reel underneath (where taps actually land),
// and a solid pill window on top that clips a second bright/bold copy of
// the same labels as it glides between them. `type` here is local state
// (not owned by a parent the way Header's `mode` is), so this drives
// itself off the type/onSelect props directly rather than round-tripping
// through an effect the way ModeSlider's `mode` prop does.
const TYPE_MODES = ['expense', 'income'];
const TYPE_LABELS = { expense: 'Expense', income: 'Income' };
const TYPE_SLOT = 72;
// Header's own version gets this for free at 3 slots: with the active
// slot centred, showing its one immediate neighbour in full (not clipped)
// needs a container at least 3 slots wide, regardless of how many modes
// actually exist — the maths is the same either way (a container exactly
// N slots wide only fully shows a neighbour up to (N-1)/2 slots away). At
// exactly 2 slots (one per mode here), that neighbour was clipped by
// exactly half its own width. Padding the container out to 3 slots — with
// only 2 real modes still centred inside it via the same offset formula —
// fixes it without changing anything about how many modes there are.
const TYPE_CONTAINER_WIDTH = TYPE_SLOT * 3;
const TYPE_BOX_PAD_V = 4;
const TYPE_BOX_PAD_H = 3;
const TYPE_BASE_TRACK_HEIGHT = 26;
const TYPE_TRACK_HEIGHT = TYPE_BASE_TRACK_HEIGHT + TYPE_BOX_PAD_V * 2;
const TYPE_BOX_WIDTH = TYPE_SLOT + TYPE_BOX_PAD_H * 2;

function typeIndexOffset(i) {
  return -(i * TYPE_SLOT + TYPE_SLOT / 2);
}

function TypeDimReel({ trackStyle, light, onSelect }) {
  return (
    <Animated.View style={[{ position: 'absolute', left: TYPE_CONTAINER_WIDTH / 2, top: 0, height: '100%', flexDirection: 'row' }, trackStyle]}>
      {TYPE_MODES.map(m => (
        <Pressable key={m} onPress={() => onSelect(m)} style={{ width: TYPE_SLOT, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
          <Text numberOfLines={1} style={{ fontSize: 10, fontWeight: '500', color: textColor(light).disabled, letterSpacing: 0.1 }}>
            {TYPE_LABELS[m]}
          </Text>
        </Pressable>
      ))}
    </Animated.View>
  );
}

function TypeSlider({ type, onSelect, light }) {
  const offset = useSharedValue(typeIndexOffset(TYPE_MODES.indexOf(type)));

  useEffect(() => {
    offset.value = withSpring(typeIndexOffset(TYPE_MODES.indexOf(type)), SPRING_SMOOTH);
  }, [type, offset]);

  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));

  return (
    <View style={{ width: TYPE_CONTAINER_WIDTH, height: TYPE_TRACK_HEIGHT, overflow: 'hidden' }}>
      <TypeDimReel trackStyle={trackStyle} light={light} onSelect={onSelect} />

      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: TYPE_CONTAINER_WIDTH / 2 - TYPE_BOX_WIDTH / 2,
          top: 0,
          width: TYPE_BOX_WIDTH,
          height: TYPE_TRACK_HEIGHT,
          borderRadius: TYPE_TRACK_HEIGHT / 2,
          backgroundColor: light ? '#eeeeec' : '#0f0f0f',
          overflow: 'hidden',
        }}
      >
        <Animated.View style={[{ position: 'absolute', left: TYPE_BOX_WIDTH / 2, top: 0, height: '100%', flexDirection: 'row' }, trackStyle]}>
          {TYPE_MODES.map(m => (
            <View key={m} style={{ width: TYPE_SLOT, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
              {/* Neutral for both, active or not — the box itself (position,
                  fill, weight, uppercase) already says which one is
                  selected; red/green stay reserved for the amount figure
                  and don't need repeating here too. */}
              <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase', color: textColor(light).primary }}>
                {TYPE_LABELS[m]}
              </Text>
            </View>
          ))}
        </Animated.View>
      </View>
    </View>
  );
}

// `light` is a one-off experimental prop for trying a light theme on just
// the Dashboard (and the flows it opens) — see the matching comment in
// Header.js. Callers outside the Dashboard keep passing nothing.
function AddModal({ open, onClose, onClosed, onAdd, onEdit, editData, light = false }) {
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
          <View className="items-center mb-6">
            <TypeSlider type={type} onSelect={setType} light={light} />
          </View>

          <Animated.View className="items-center" style={[{ marginTop: 16, marginBottom: 8 }, amountShake.style]}>
            <AmountRow
              amount={amount}
              prevAmountLength={prevAmountLength}
              skipDigitAnim={skipDigitAnim}
              light={light}
              digitFontSize={56}
              lineHeight={64}
              zeroColor={light ? 'rgba(0,0,0,0.82)' : 'rgba(255,255,255,0.82)'}
              // Matches SummaryCard's own headline figure (weight 400,
              // letterSpacing -1.75 at its 44px) — same ratio scaled to
              // this field's 56px, so the two "the one number that matters"
              // amounts in the app read as the same typeface treatment.
              weight="400"
              letterSpacing={-2.2}
              // This sheet has real spare room around the amount (unlike
              // the callers autoShrink was built for), so a longer entry
              // just keeps typing at the same size instead of shrinking
              // toward MIN_SCALE.
              autoShrink={false}
            />
          </Animated.View>

          {/* Description moved back in right after the amount — living in
              the footer (a separate sibling further down) left an
              unexplained gap between them; being a direct, tightly-margined
              neighbor here guarantees there's no room for anything to
              insert space between the two. */}
          {/* No background/border any more — a plain ghost-text field,
              matching the amount above it (no box there either). The input
              still fills its wrapper's full height and centres its own
              text inside it, rather than the wrapper centring an
              auto-height input: a TextInput's natural height isn't its
              text's height — it reserves extra room for the editing caret
              — so centring that box put the text off-centre. Height also
              has to be explicit rather than padding-derived: with zero
              padding and no height the box hugs the text and clips
              descenders. */}
          <View
            style={{
              alignSelf: 'center', marginTop: 12, minWidth: 130, height: DESCRIPTION_FIELD_H,
              justifyContent: 'center',
            }}
          >
            {/* The shake rides on this wrapper, not the input itself, so
                translating this moves only the text and caret — the same
                "only the wording shakes, not anything around it" this used
                to get from a separate placeholder overlay. The shake only
                ever fires while the field is empty (see the submit guard
                above), so what visibly shakes is still the placeholder. */}
            <Animated.View style={descriptionShake.style}>
              <TextInput
                ref={descriptionInputRef}
                value={description}
                onChangeText={setDescription}
                // The native placeholder, NOT a <Text> drawn on top. An
                // overlay is a different text renderer than the one drawing
                // the input's own value, and the two don't agree on where
                // the baseline sits inside a given box — which is why the
                // text appeared to drop a couple of pixels the moment you
                // typed. Matching their padding, height and centring can
                // get close but never exact; one view drawing both states
                // is the only arrangement where they can't disagree.
                placeholder="Description"
                placeholderTextColor={light ? '#b0b0b0' : '#4d4d4d'}
                // The `transactions.description` column is plain text with no
                // server-side length constraint — this is the only cap it
                // gets, since it's a short label ("Netflix", "Electricity
                // bill"), not free-form notes.
                maxLength={140}
                className="px-4 text-base text-center"
                style={[
                  INPUT_TEXT_STYLE,
                  {
                    color: light ? '#111111' : '#ffffff',
                    height: DESCRIPTION_FIELD_H,
                    paddingVertical: 0,
                  },
                ]}
              />
            </Animated.View>
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

export default memo(AddModal);
