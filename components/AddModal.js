import { memo, useCallback, useState, useEffect, useRef } from 'react';
import { Modal, View, Text, TextInput, Pressable, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS } from 'react-native-reanimated';
import Svg, { Rect, Line } from 'react-native-svg';
import { today, toTitleCase } from '../utils/format';
import CalendarPicker from './CalendarPicker';
import { GlassPressable } from './Glass';
import { NumericKeypad } from './NumericKeypad';
import { AmountRow } from './AmountField';

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

function AddModal({ open, onClose, onClosed, onAdd, onEdit, editData }) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const isEdit = !!editData;
  const [type, setType] = useState('expense');
  // Container width is measured (not a fixed constant like Header's tab
  // toggle) since this modal is full device width and needs to work across
  // screen sizes — the sliding pill's target position derives from it.
  const [typeToggleWidth, setTypeToggleWidth] = useState(0);
  const typePillX = useSharedValue(0);
  const typePillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: typePillX.value }] }));
  useEffect(() => {
    if (!typeToggleWidth) return;
    const pillWidth = (typeToggleWidth - 6) / 2; // p-[3px] container padding on both sides
    typePillX.value = withTiming((type === 'income' ? 1 : 0) * pillWidth, { duration: 260, easing: SETTLE_EASING });
  }, [type, typeToggleWidth]);
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
        { duration: 420, easing: SETTLE_EASING },
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
      {/* RN's <Modal> stays fully touch-active for its whole lifetime —
          `visible` only flips to false once the close animation below has
          actually finished, so without this the FAB underneath (and
          anything else on Dashboard) is unreachable for the ~600ms the
          content is sliding off-screen, even though it's already invisible.
          `open` (not `visible`) flips to false the instant a close starts,
          so touches fall through immediately instead of at the end. */}
      <Animated.View className="flex-1 bg-bg" style={pageStyle} pointerEvents={open ? 'auto' : 'none'}>
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
          <View
            className="flex-row rounded-full p-[3px] mb-8"
            style={{ backgroundColor: '#161616' }}
            onLayout={e => setTypeToggleWidth(e.nativeEvent.layout.width)}
          >
            {typeToggleWidth > 0 && (
              <Animated.View
                style={[
                  { position: 'absolute', top: 3, bottom: 3, left: 3, width: (typeToggleWidth - 6) / 2, borderRadius: 999, backgroundColor: '#d4d4d4' },
                  typePillStyle,
                ]}
              />
            )}
            {['expense', 'income'].map(t => (
              <Pressable
                key={t}
                onPress={() => setType(t)}
                className="flex-1 py-[6px] rounded-full items-center"
              >
                <Text
                  className={type === t ? 'text-black text-base font-medium' : 'text-white/35 text-base font-medium'}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>

          <View className="mb-8 items-center">
            <AmountRow amount={amount} prevAmountLength={prevAmountLength} skipDigitAnim={skipDigitAnimRef.current} />
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

          <View className="mb-6">
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
        <NumericKeypad onKeyPress={handleKeypadPress} insetBottom={insets.bottom} />
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
