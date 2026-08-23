import { memo, useCallback, useState, useEffect, useRef } from 'react';
import { Modal, View, Text, TextInput, Pressable, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS, LinearTransition } from 'react-native-reanimated';
import Svg, { Rect, Line } from 'react-native-svg';
import { today, toTitleCase } from '../utils/format';
import CalendarPicker from './CalendarPicker';
import { GlassPressable } from './Glass';

// How far (px) or how fast (px/s) a downward drag on the handle needs to go
// before it counts as "dismiss" rather than snapping back.
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;
// Larger than any real screen height — used as the "well off-screen" target
// for the dismiss-drag's finishing slide, without needing to measure the
// actual window height just for this.
const OFF_SCREEN_Y = 1200;

// Same ease-out-expo "settle" feel used for reveals throughout the app
// (welcome flow, account.js, onboarding).
const SETTLE_EASING = Easing.bezier(0.16, 1, 0.3, 1);

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function formatDisplay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

function CalIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 14 14" fill="none">
      <Rect x="1" y="2.5" width="12" height="10.5" rx="2" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
      <Line x1="1" y1="5.5" x2="13" y2="5.5" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
      <Line x1="4.5" y1="1" x2="4.5" y2="4" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" strokeLinecap="round" />
      <Line x1="9.5" y1="1" x2="9.5" y2="4" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" strokeLinecap="round" />
    </Svg>
  );
}

// A plain button grid standing in for the OS decimal-pad keyboard on the
// Amount field — Amount is the field that auto-focused on open, so it was
// the one actually causing the "keyboard pops in after the sheet" mismatch.
// A custom keypad has no native show/hide lifecycle to sync with at all: it
// just renders as a permanent, fixed-height part of this screen's layout
// from the moment it mounts. (Description stays a normal TextInput — see
// the discussion this was born from: a full custom text keyboard trades
// away autocorrect/dictation/accessibility for a field that isn't the one
// causing the problem in the first place.)
const KEYPAD_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', 'backspace'],
];

// Flat, no per-key box — just the digit sitting on the page background,
// matching the reference. Feedback on tap comes from a Reanimated scale+dim
// on the label itself (driven via onPressIn/onPressOut, not the Pressable's
// own style prop — a function-style prop on Pressable doesn't reliably
// apply in this NativeWind setup, same issue GlassPressable works around).
function KeypadKey({ label, onPress }) {
  const pressProgress = useSharedValue(0);

  function handlePressIn() {
    pressProgress.value = withTiming(1, { duration: 90, easing: Easing.out(Easing.cubic) });
  }
  function handlePressOut() {
    pressProgress.value = withTiming(0, { duration: 160, easing: Easing.out(Easing.cubic) });
  }

  const labelStyle = useAnimatedStyle(() => ({
    opacity: 1 - pressProgress.value * 0.5,
    transform: [{ scale: 1 - pressProgress.value * 0.15 }],
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={{ flex: 1, height: 64, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.Text style={[{ color: '#ffffff', fontSize: label === 'backspace' ? 24 : 30, fontWeight: '400' }, labelStyle]}>
        {label === 'backspace' ? '⌫' : label}
      </Animated.Text>
    </Pressable>
  );
}

// Shared by every element in the amount row (₹ symbol included) — the row
// is center-justified, so adding a digit grows its total width and shifts
// *everything* in it left to stay centered, not just the new digit. Giving
// them all the same layout transition is what makes that read as one
// element sliding together instead of the symbol/older digits snapping
// while only the new digit animates.
const AMOUNT_LAYOUT_TRANSITION = LinearTransition.duration(420).easing(SETTLE_EASING);

// Each newly-typed digit blurs into focus rather than just appearing flat —
// starts slightly enlarged, near-transparent, and genuinely blurred (RN's
// textShadowRadius is a real Gaussian blur on the glyph itself, not a fake),
// then resolves to sharp/full-size/full-opacity. Only the character that
// just appeared plays this — existing digits are stable-keyed by index so
// they never remount/replay it, and it's skipped entirely when the field is
// populated programmatically (opening in edit mode) rather than typed.
function AmountDigit({ char, animateIn }) {
  // Split from the fade so blur resolves quickly (it's a hint the digit is
  // "arriving", not the main event) while opacity — the actual materialize
  // — takes noticeably longer, reading as a fade-in with a light touch of
  // blur rather than a blur-dominated reveal.
  const fadeProgress = useSharedValue(animateIn ? 0 : 1);
  const blurProgress = useSharedValue(animateIn ? 0 : 1);

  useEffect(() => {
    if (animateIn) {
      fadeProgress.value = withTiming(1, { duration: 640, easing: SETTLE_EASING });
      blurProgress.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: fadeProgress.value,
    transform: [
      { scale: 0.82 + fadeProgress.value * 0.18 },
      { translateY: (1 - fadeProgress.value) * 16 },
    ],
    textShadowRadius: (1 - blurProgress.value) * 6,
  }));

  return (
    <Animated.Text
      layout={AMOUNT_LAYOUT_TRANSITION}
      style={[
        {
          fontSize: 48, lineHeight: 56, fontWeight: '600', color: '#ffffff',
          textShadowColor: '#ffffff', textShadowOffset: { width: 0, height: 0 },
        },
        style,
      ]}
    >
      {char}
    </Animated.Text>
  );
}

function AmountKeypad({ onKeyPress, insetBottom }) {
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: insetBottom + 10 }}>
      {KEYPAD_ROWS.map((row, ri) => (
        <View key={ri} className="flex-row" style={{ marginBottom: ri === KEYPAD_ROWS.length - 1 ? 0 : 6 }}>
          {row.map(key => (
            <KeypadKey key={key} label={key} onPress={() => onKeyPress(key)} />
          ))}
        </View>
      ))}
    </View>
  );
}

function AddModal({ open, onClose, onClosed, onAdd, onEdit, editData }) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const isEdit = !!editData;
  const [type, setType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState('');
  const [calOpen, setCalOpen] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Stable reference — CalendarPicker is memo()-wrapped, and AddModal
  // re-renders on every keystroke in the amount/description fields, so an
  // inline arrow here would defeat that memo the whole time the calendar
  // overlay is open.
  const closeCalendar = useCallback(() => setCalOpen(false), []);

  // Tracks the Amount string's length as of the previous render, so a
  // freshly-typed trailing digit can be told apart from ones that were
  // already there — read during render (still holds the prior value at that
  // point), written after every render for the next one to see.
  const prevAmountLengthRef = useRef(0);
  const prevAmountLength = prevAmountLengthRef.current;
  useEffect(() => {
    prevAmountLengthRef.current = amount.length;
  });
  // Suppressed when the field is populated programmatically (opening in
  // edit mode, or resetting on close) rather than actually typed — those
  // digits should just appear, not play the per-keystroke blur-in.
  const skipDigitAnimRef = useRef(true);

  function handleKeypadPress(key) {
    Haptics.selectionAsync();
    skipDigitAnimRef.current = false;
    setAmount(prev => {
      if (key === 'backspace') return prev.slice(0, -1);
      if (key === '.') {
        if (prev.includes('.')) return prev;
        return prev === '' ? '0.' : `${prev}.`;
      }
      if (prev === '0') return key;
      const decimals = prev.split('.')[1];
      if (decimals != null && decimals.length >= 2) return prev; // max 2 decimal places
      if (prev.replace('.', '').length >= 9) return prev; // sane upper bound
      return prev + key;
    });
  }

  // RN's built-in Modal animationType only animates the WHOLE modal content
  // as one transform — managed independently here instead so `visible`
  // stays mounted through the close animation and it can actually play.
  const [visible, setVisible] = useState(open);
  const pageTranslateY = useSharedValue(windowHeight);
  const dragY = useSharedValue(0);

  useEffect(() => {
    if (open) {
      setVisible(true);
      dragY.value = 0;
      pageTranslateY.value = withTiming(0, { duration: 950, easing: SETTLE_EASING });
    } else {
      pageTranslateY.value = withTiming(
        windowHeight,
        { duration: 680, easing: SETTLE_EASING },
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
      skipDigitAnimRef.current = true;
      if (editData) {
        setType(editData.type);
        setAmount(String(editData.amount));
        setDate(editData.date);
        setDescription(editData.description);
      } else {
        setType('expense');
        setAmount('');
        setDate(today());
        setDescription('');
      }
      setCalOpen(false);
      setError('');
      // Without this, a successful add left `submitting` permanently true
      // (see handleSubmit below) — the next time the sheet opened fresh,
      // the button showed "Adding"/"Updating" and stayed disabled forever.
      setSubmitting(false);
    }
  }, [open, editData]);

  async function handleSubmit() {
    const val = parseFloat(amount);
    if (!val || val <= 0) return;
    setSubmitting(true);
    setError('');
    const result = isEdit
      ? await onEdit(editData.id, { type, amount: val, date, description: toTitleCase(description) })
      : await onAdd({ type, amount: val, date, description: toTitleCase(description) });
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
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onClose();
  }

  const canSubmit = !!amount && parseFloat(amount) > 0 && !submitting;

  // Drag-to-dismiss from anywhere on the card, not just the handle.
  // activeOffsetY/failOffsetY are what make this safe to wrap around the
  // ScrollView and every button/key without stealing normal taps or
  // upward scrolling: the gesture only actually activates once a touch has
  // clearly moved down (12px) — a tap's near-zero movement never crosses
  // that, so it falls through to the Pressable underneath untouched — and
  // it explicitly fails itself if the touch moves up first, leaving that
  // to the ScrollView.
  //
  // That threshold alone isn't enough for touches that *start* inside the
  // ScrollView, though — its native scroll responder claims those before
  // this (a JS-thread RNGH gesture) gets a chance to see them, which is
  // exactly why dragging worked from the keypad (a sibling, outside the
  // ScrollView) but not from Amount/Date/Description above it. `nativeScroll`
  // is the ScrollView's own gesture made explicit, and
  // `simultaneousWithExternalGesture` tells RNGH the two are allowed to
  // both recognize the same touch — so a touch inside the ScrollView can
  // still reach this Pan and cross its activation threshold instead of
  // being swallowed.
  const nativeScroll = Gesture.Native();
  const pan = Gesture.Pan()
    .activeOffsetY(12)
    .failOffsetY(-12)
    .simultaneousWithExternalGesture(nativeScroll)
    .onUpdate(e => {
      if (e.translationY > 0) dragY.value = e.translationY;
    })
    .onEnd(e => {
      if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
        dragY.value = withTiming(OFF_SCREEN_Y, { duration: 420, easing: SETTLE_EASING });
        runOnJS(onClose)();
      } else {
        dragY.value = withTiming(0, { duration: 380, easing: SETTLE_EASING });
      }
    });

  const pageStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pageTranslateY.value + dragY.value }],
  }));

  // Unmount the whole tree while closed instead of just hiding it behind
  // Modal's own visible=false — left mounted, all of this stays in the React
  // tree and keeps re-rendering on every unrelated Dashboard state change.
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View className="flex-1 bg-bg" style={pageStyle}>
      <GestureDetector gesture={pan}>
      <View style={{ flex: 1 }}>
        <View style={{ paddingTop: insets.top + 10, paddingBottom: 24, alignItems: 'center' }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' }} />
        </View>

        {/* No flex:1 here deliberately — this content (toggle/amount/date/
            description) is short and fixed, so stretching the ScrollView's
            viewport to fill the space up to the footer just left a big dead
            gap between Description and the button. Sizing to content means
            the button and keypad sit right after it instead. */}
        <GestureDetector gesture={nativeScroll}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 20 }}
        >
          <View className="flex-row rounded-full p-[3px] mb-8" style={{ backgroundColor: '#161616' }}>
            {['expense', 'income'].map(t => (
              <Pressable
                key={t}
                onPress={() => setType(t)}
                className="flex-1 py-[6px] rounded-full items-center"
                style={type === t ? { backgroundColor: '#ffffff' } : null}
              >
                <Text className={type === t ? 'text-black text-base font-medium' : 'text-white/35 text-base font-medium'}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>

          <View className="mb-8 items-center">
            {/* No gap on this row — a gap-* class puts equal space between
                every child, which meant every single digit, not just the ₹
                symbol before the first one. The ₹ carries its own marginRight
                instead, and digits sit directly adjacent like a real number. */}
            <View className="flex-row items-center justify-center">
              <Animated.Text
                layout={AMOUNT_LAYOUT_TRANSITION}
                className="font-light text-white/35"
                style={{ fontSize: 44, lineHeight: 56, marginRight: 4 }}
              >
                ₹
              </Animated.Text>
              {amount ? (
                [...amount].map((char, i) => (
                  <AmountDigit key={i} char={char} animateIn={i >= prevAmountLength && !skipDigitAnimRef.current} />
                ))
              ) : (
                <Text className="font-semibold" style={{ fontSize: 48, lineHeight: 56, color: '#333333' }}>0</Text>
              )}
            </View>
          </View>

          <View className="mb-6">
            <Text className="text-white text-[15px] font-medium mb-2">Date</Text>
            <GlassPressable
              variant="field"
              onPress={() => setCalOpen(true)}
              className="w-full px-4 py-3 flex-row items-center justify-between"
              style={{ borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' }}
            >
              <Text className="text-white text-base">{formatDisplay(date)}</Text>
              <CalIcon />
            </GlassPressable>
          </View>

          <View>
            <Text className="text-white text-[15px] font-medium mb-2">Description</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="What was this for?"
              placeholderTextColor="#4d4d4d"
              className="w-full rounded-xl px-4 py-3 text-white text-base"
              style={{ backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' }}
            />
          </View>
        </ScrollView>
        </GestureDetector>

        {!!error && <Text className="text-red-400 text-base text-center mx-5 mb-3">{error}</Text>}
        <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
          <GlassPressable
            variant="active"
            radius={16}
            disabled={!canSubmit}
            onPress={handleSubmit}
            className="w-full py-[14px] items-center"
          >
            <Text className="text-black text-base font-semibold">
              {isEdit
                ? (submitting ? 'Updating' : 'Update')
                : (submitting ? 'Adding' : `Add ${type.charAt(0).toUpperCase() + type.slice(1)}`)}
            </Text>
          </GlassPressable>
        </View>

        {/* Fixed, always-present keypad for Amount — same permanent-layout
            idea as the reference recording this was modeled on: no keyboard
            lifecycle to sync with because there's no real keyboard involved. */}
        <AmountKeypad onKeyPress={handleKeypadPress} insetBottom={insets.bottom} />
      </View>
      </GestureDetector>
      </Animated.View>

      {/* Calendar overlay — lives inside this same Modal (avoids nested-Modal
          quirks on iOS). Anchored near the top rather than centered. */}
      {calOpen && (
        <Pressable
          style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'flex-start', paddingHorizontal: 24, paddingTop: insets.top + 70 }]}
          onPress={closeCalendar}
        >
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000000' }]} />
          <View style={{ width: '100%', maxWidth: 360 }}>
            <CalendarPicker value={date} onChange={setDate} onClose={closeCalendar} />
          </View>
        </Pressable>
      )}
    </Modal>
  );
}

export default memo(AddModal);
