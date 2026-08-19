import { memo, useCallback, useState, useEffect, useRef } from 'react';
import { Modal, View, Text, TextInput, Pressable, KeyboardAvoidingView, Keyboard, Platform, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS } from 'react-native-reanimated';
import Svg, { Rect, Line } from 'react-native-svg';
import { today, toTitleCase } from '../utils/format';
import CalendarPicker from './CalendarPicker';
import { GlassView, GlassPressable } from './Glass';

const BLUR_METHOD = Platform.OS === 'android' ? 'dimezisBlurView' : undefined;
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

function AddModal({ open, onClose, onClosed, onAdd, onEdit, onDelete, editData }) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  // Tracked so sheetMaxHeight below can shrink to fit above the keyboard.
  // Without this, the card kept its full static height while
  // KeyboardAvoidingView's own bottom padding pushed it up — the padding and
  // the stale, too-large maxHeight fought each other, squeezing the footer
  // button down toward (or under) the keyboard instead of sitting cleanly
  // above it.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, e => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // A concrete pixel cap, not a percentage string — percentage heights are
  // ambiguous in RN's layout engine once nested inside flex + ScrollView
  // (resolves fine in the web preview's browser-based layout, but silently
  // collapses content on real native devices). This was the root cause of
  // the Description field/submit button rendering squished on-device.
  const sheetMaxHeight = Math.round(
    keyboardHeight > 0
      ? windowHeight - keyboardHeight - insets.top - 16
      : windowHeight * 0.85
  );
  // Room reserved below the ScrollView for the fixed footer (button(s) +
  // its own top padding) plus the GlassView's bottom safe-area padding —
  // too tight a reserve here let the footer get squeezed toward/under the
  // keyboard on the shortest (keyboard-open) sheet sizes.
  const footerReserve = 150 + insets.bottom;
  const isEdit = !!editData;
  const [type, setType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState('');
  const [calOpen, setCalOpen] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const amountRef = useRef(null);
  const scrollRef = useRef(null);
  // Stable reference — CalendarPicker is memo()-wrapped, and AddModal
  // re-renders on every keystroke in the amount/description fields, so an
  // inline arrow here would defeat that memo the whole time the calendar
  // overlay is open.
  const closeCalendar = useCallback(() => setCalOpen(false), []);

  // RN's built-in Modal animationType only animates the WHOLE modal content
  // as one transform — the backdrop was sliding up together with the sheet
  // instead of fading in place. Managed independently here instead:
  // animationType="none" on the Modal, backdrop opacity and sheet
  // translateY driven separately so the backdrop fades while the sheet
  // slides, and `visible` stays mounted through the close animation so it
  // can play instead of the modal disappearing instantly.
  const [visible, setVisible] = useState(open);
  const backdropOpacity = useSharedValue(0);
  const sheetTranslateY = useSharedValue(sheetMaxHeight);

  useEffect(() => {
    if (open) {
      setVisible(true);
      backdropOpacity.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
      sheetTranslateY.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) });
      // Delayed to land after the sheet's slide-up animation actually
      // finishes — focusing (and thus opening the keyboard) mid-slide reads
      // as janky, and on Android the keyboard can outright fail to show if
      // requested before the TextInput has settled into its final position.
      const focusTimer = setTimeout(() => amountRef.current?.focus(), 340);
      return () => clearTimeout(focusTimer);
    } else {
      backdropOpacity.value = withTiming(0, { duration: 240, easing: Easing.in(Easing.cubic) });
      sheetTranslateY.value = withTiming(
        sheetMaxHeight,
        { duration: 240, easing: Easing.in(Easing.cubic) },
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
    setSubmitting(false);
    if (result?.success === false) { setError(result.error || 'Something went wrong. Please try again.'); return; }
    onClose();
  }

  const canSubmit = !!amount && parseFloat(amount) > 0 && !submitting;

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sheetTranslateY.value }] }));

  // Unmount the whole tree while closed instead of just hiding it behind
  // Modal's own visible=false — this component has ~10 GlassView/
  // GlassPressable instances (each backed by a real-time BlurView), plus a
  // ScrollView and TextInputs. Left mounted, all of that stays in the React
  // tree and keeps re-rendering (and consuming a memo() slot that a stale
  // inline onClose prop already defeats) on every unrelated Dashboard state
  // change — this is the single heaviest subtree in the app to be paying
  // that cost for nothing while the modal is closed.
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable style={{ flex: 1 }} onPress={onClose}>
          <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
            <BlurView intensity={35} tint="dark" experimentalBlurMethod={BLUR_METHOD} style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />
          </Animated.View>
        </Pressable>

        {/* No maxHeight cap here (unlike the GlassView below, deliberately) —
            capping this outer wrapper too fought against the bottom padding
            `behavior="padding"` adds when the keyboard opens, squeezing the
            card's content into less space than it needed instead of letting
            the whole thing shift upward. The GlassView's own (keyboard-aware)
            maxHeight is what actually bounds the visible card size.

            KeyboardAvoidingView's `behavior` is a no-op on Android
            (`undefined`) — shrinking the GlassView's maxHeight alone isn't
            enough there, since this whole column is still bottom-anchored to
            the full screen height (windowSoftInputMode is "adjustNothing",
            so the OS never shrinks the window for the keyboard either). The
            sheet's shorter box just sat with its bottom edge glued to the
            true screen bottom — behind the keyboard — instead of right above
            it. marginBottom shifts the whole sheet up by the keyboard's
            height to actually clear it. */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={Platform.OS === 'android' && keyboardHeight > 0 ? { marginBottom: keyboardHeight + 56 } : undefined}
        >
          <Animated.View style={sheetStyle}>
            <GlassView
              variant="modal"
              radius={24}
              corners="t"
              className="px-6 pt-5"
              style={{ maxHeight: sheetMaxHeight, paddingBottom: insets.bottom }}
            >
            <ScrollView
              ref={scrollRef}
              style={{ flexGrow: 0, flexShrink: 1, maxHeight: sheetMaxHeight - footerReserve }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              <View className="w-8 h-1 rounded-full mx-auto mb-5" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }} />

              <View className="flex-row rounded-full p-[3px] mb-5" style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}>
                {['expense', 'income'].map(t => (
                  <Pressable
                    key={t}
                    onPress={() => setType(t)}
                    className="flex-1 py-[6px] rounded-full items-center"
                    style={type === t ? { backgroundColor: 'rgba(255,255,255,0.14)' } : null}
                  >
                    <Text className={type === t ? 'text-white text-base font-medium' : 'text-white/35 text-base font-medium'}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View className="mb-6 items-center">
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

              <View className="mb-4">
                <Text className="text-white/35 text-sm font-medium mb-2 uppercase tracking-wider">Date</Text>
                <GlassPressable
                  variant="glass"
                  onPress={() => setCalOpen(true)}
                  className="w-full px-4 py-3 flex-row items-center justify-between"
                >
                  <Text className="text-white text-base">{formatDisplay(date)}</Text>
                  <CalIcon />
                </GlassPressable>
              </View>

              <View className="mb-6">
                <Text className="text-white/35 text-sm font-medium mb-2 uppercase tracking-wider">Description</Text>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
                  placeholder="What was this for?"
                  placeholderTextColor="#333333"
                  className="w-full rounded-xl px-4 py-3 text-white text-base"
                  style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
                />
              </View>

            </ScrollView>

            {/* Fixed footer — always visible regardless of scroll position, so the
                action button can never end up scrolled out of view (was the bug).
                Bottom safe-area padding lives on the GlassView itself so it's part
                of the visible card, not a gap exposing the backdrop behind it. */}
            <View style={{ paddingTop: 12 }}>
              {!!error && <Text className="text-red-400 text-base text-center mb-3">{error}</Text>}
              {isEdit ? (
                <View className="flex-row gap-3">
                  <GlassPressable
                    variant="active"
                    radius={16}
                    disabled={!canSubmit}
                    onPress={handleSubmit}
                    className="flex-1 py-[14px] items-center"
                  >
                    <Text className="text-white text-base font-semibold">{submitting ? 'Updating…' : 'Update'}</Text>
                  </GlassPressable>
                  <Pressable
                    onPress={() => { onDelete(editData.id); onClose(); }}
                    className="flex-1 py-[14px] rounded-2xl items-center"
                    style={{ backgroundColor: 'rgba(248,113,113,0.12)' }}
                  >
                    <Text className="text-base font-semibold" style={{ color: 'rgba(248,113,113,0.85)' }}>Delete</Text>
                  </Pressable>
                </View>
              ) : (
                <GlassPressable
                  variant="active"
                  radius={16}
                  disabled={!canSubmit}
                  onPress={handleSubmit}
                  className="w-full py-[14px] items-center"
                >
                  <Text className="text-white text-base font-semibold">{submitting ? 'Adding…' : `Add ${type.charAt(0).toUpperCase() + type.slice(1)}`}</Text>
                </GlassPressable>
              )}
            </View>
            </GlassView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>

      {/* Calendar overlay — lives inside this same Modal (avoids nested-Modal quirks on iOS).
          Anchored near the top rather than centered — centered would sit right
          where the keyboard is if a text field was focused when Date was
          tapped, and dismissing the keyboard just to open this was more
          disruptive than useful (user has to re-tap the field afterwards). */}
      {calOpen && (
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'flex-start', paddingHorizontal: 24, paddingTop: insets.top + 70 }]}
          onPress={closeCalendar}
        >
          <View style={{ width: '100%', maxWidth: 360 }}>
            <CalendarPicker value={date} onChange={setDate} onClose={closeCalendar} />
          </View>
        </Pressable>
      )}
    </Modal>
  );
}

export default memo(AddModal);
