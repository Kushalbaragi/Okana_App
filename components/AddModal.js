import { memo, useCallback, useState, useEffect, useRef } from 'react';
import { Modal, View, Text, TextInput, Pressable, Platform, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS } from 'react-native-reanimated';
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

// A fixed amount of space reserved at the bottom of the page for the
// keyboard — sized to comfortably fit either the decimal-pad (Amount) or
// the full text keyboard (Description). Because this is a static reserve,
// not something recomputed from keyboardWillShow/Hide events, the layout
// above it never has to shift or resize when focus moves between fields or
// the keyboard opens/closes — whichever keyboard is showing just occupies
// (part of) this already-reserved space.
const KEYBOARD_RESERVE = Platform.select({ ios: 336, android: 300 });

function AddModal({ open, onClose, onClosed, onAdd, onEdit, editData }) {
  const insets = useSafeAreaInsets();

  const isEdit = !!editData;
  const [type, setType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState('');
  const [calOpen, setCalOpen] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const amountRef = useRef(null);
  // Stable reference — CalendarPicker is memo()-wrapped, and AddModal
  // re-renders on every keystroke in the amount/description fields, so an
  // inline arrow here would defeat that memo the whole time the calendar
  // overlay is open.
  const closeCalendar = useCallback(() => setCalOpen(false), []);

  // RN's built-in Modal animationType only animates the WHOLE modal content
  // as one transform — managed independently here instead so `visible`
  // stays mounted through the close animation and it can actually play.
  //
  // Opacity-only, not a translateY slide — a position transform mid-flight
  // is exactly what previously forced a delay before calling .focus() (a
  // native TextInput doesn't reliably accept focus, and Android's keyboard
  // can outright fail to appear, while its on-screen position is still
  // animating). Fading in at its final, settled position instead means
  // focus() can fire immediately, so the keyboard rises together with the
  // page instead of visibly afterward.
  const [visible, setVisible] = useState(open);
  const pageOpacity = useSharedValue(0);
  const dragY = useSharedValue(0);

  useEffect(() => {
    if (open) {
      setVisible(true);
      dragY.value = 0;
      pageOpacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
      // Auto-focus is only for adding a new transaction — editing an
      // existing one opens straight to the filled-in form without grabbing
      // the keyboard.
      if (!isEdit) {
        const focusTimer = setTimeout(() => amountRef.current?.focus(), 30);
        return () => clearTimeout(focusTimer);
      }
    } else {
      pageOpacity.value = withTiming(
        0,
        { duration: 200, easing: Easing.in(Easing.cubic) },
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

  // Drag-to-dismiss on the handle only (not the whole page) — scoping it
  // avoids fighting the ScrollView's own vertical pan and the TextInputs
  // underneath. Past the threshold, the handle finishes sliding off-screen
  // itself while onClose() (called via runOnJS, since this runs on the UI
  // thread) triggers the same fade-out the button/backdrop-tap paths use.
  const pan = Gesture.Pan()
    .onUpdate(e => {
      if (e.translationY > 0) dragY.value = e.translationY;
    })
    .onEnd(e => {
      if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
        dragY.value = withTiming(OFF_SCREEN_Y, { duration: 220, easing: Easing.in(Easing.cubic) });
        runOnJS(onClose)();
      } else {
        dragY.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
      }
    });

  const pageStyle = useAnimatedStyle(() => ({
    opacity: pageOpacity.value,
    transform: [{ translateY: dragY.value }],
  }));

  // Unmount the whole tree while closed instead of just hiding it behind
  // Modal's own visible=false — left mounted, all of this stays in the React
  // tree and keeps re-rendering on every unrelated Dashboard state change.
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View className="flex-1 bg-bg" style={pageStyle}>
        <GestureDetector gesture={pan}>
          <View style={{ paddingTop: insets.top + 10, paddingBottom: 18, alignItems: 'center' }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' }} />
            <Text className="text-white text-base font-semibold" style={{ marginTop: 14 }}>
              {isEdit ? 'Edit Transaction' : 'Add Transaction'}
            </Text>
          </View>
        </GestureDetector>

        <ScrollView
          style={{ flex: 1 }}
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
            <View className="flex-row items-center justify-center gap-1">
              <Text className="text-4xl font-light text-white/35" style={{ lineHeight: 56 }}>₹</Text>
              <TextInput
                ref={amountRef}
                value={amount}
                onChangeText={setAmount}
                placeholder="0"
                placeholderTextColor="#333333"
                keyboardType="decimal-pad"
                className="font-semibold text-left text-white"
                // text-5xl's default lineHeight (1x font-size) is too tight for
                // iOS to render tall digit glyphs in a TextInput without
                // clipping their tops — set both explicitly with headroom.
                //
                // Left-aligned rather than centered: on Android, an empty
                // TextInput with textAlign:'center' places the blinking
                // caret at a different horizontal position than the
                // (also centered) placeholder text, reading as a large,
                // unexplained gap between "0" and the cursor. Left-align
                // anchors both the placeholder and caret right after the
                // ₹ symbol, which sidesteps the mismatch entirely.
                style={{ minWidth: 24, fontSize: 48, lineHeight: 56 }}
              />
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

        {/* Footer sits right above the fixed keyboard reserve, not the real
            keyboard edge — its position never changes when the keyboard
            opens/closes or switches type. */}
        <View style={{ paddingHorizontal: 20, paddingBottom: KEYBOARD_RESERVE + 16 }}>
          {!!error && <Text className="text-red-400 text-base text-center mb-3">{error}</Text>}
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
      </Animated.View>

      {/* Calendar overlay — lives inside this same Modal (avoids nested-Modal
          quirks on iOS). Anchored near the top rather than centered —
          centered would sit right where the keyboard is if a text field was
          focused when Date was tapped. */}
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
