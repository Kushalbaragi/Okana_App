import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Keyboard, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS, interpolateColor, FadeIn, FadeOut } from 'react-native-reanimated';
import Svg, { Rect, Line } from 'react-native-svg';
import { InlineSheet } from './InlineSheet';
import SegmentedSwitch from './SegmentedSwitch';
import CalendarPicker from './CalendarPicker';
import { NumericKeypad, nextAmountValue } from './NumericKeypad';
import { AmountRow } from './AmountField';
import { GlassPressable, INPUT_TEXT_STYLE } from './Glass';
import { useShake } from '../hooks/useShake';
import { TrashIcon } from './icons';
import { ROUNDED_FONT } from './savingsShared';
import AmountRuler, { RulerFigure, MIN_TARGET } from './AmountRuler';
import { formatCurrency, shiftDate, today } from '../utils/format';

// Same as AddModal's description pill, so the two sheets read as one family.
const PILL_H = 40;

// Ideas for a goal's name, offered under the name field and on the empty
// state. Tapping one just fills the name in; it can still be edited.
export const GOAL_SUGGESTIONS = ['Emergency fund', 'Vacation', 'Bike', 'Home', 'New phone', 'Wedding'];

const MONEY_TYPES = [
  { id: 'add', label: 'Add' },
  { id: 'withdraw', label: 'Withdraw' },
];

// The amount-entry plumbing AddModal does inline, shared by both sheets here:
// what's been typed, which digits are new (so only a freshly typed one plays
// its entrance), and a stable key handler for the memo'd keypad.
function useAmountEntry() {
  const [amount, setAmount] = useState('');

  // Length as of the previous render, so a freshly-typed trailing digit can be
  // told apart from ones already there — read during render (still the prior
  // value), written after every render for the next one to see.
  const prevLengthRef = useRef(0);
  const prevAmountLength = prevLengthRef.current;
  useEffect(() => { prevLengthRef.current = amount.length; });

  // Suppressed when the field is filled programmatically (opening in edit mode
  // or resetting) rather than typed — those digits should just appear.
  const skipDigitAnimRef = useRef(true);

  // NumericKeypad is memo()-wrapped; the ref keeps the latest `amount`
  // reachable without the handler itself ever changing identity.
  const keyPressRef = useRef();
  keyPressRef.current = (key) => {
    const next = nextAmountValue(amount, key);
    if (next !== amount) {
      skipDigitAnimRef.current = false;
      setAmount(next);
    }
  };
  const onKeyPress = useCallback((key) => keyPressRef.current(key), []);

  const setProgrammatic = useCallback((value) => {
    skipDigitAnimRef.current = true;
    setAmount(value);
  }, []);

  return { amount, prevAmountLength, skipDigitAnim: skipDigitAnimRef.current, onKeyPress, setProgrammatic };
}

function TextPill({ value, onChangeText, placeholder, maxLength, shake, light, autoCapitalize }) {
  return (
    <View
      style={{
        alignSelf: 'center', minWidth: 160, height: PILL_H,
        borderRadius: 9999, justifyContent: 'center',
        backgroundColor: light ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.15)',
        borderWidth: 1, borderColor: light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.07)',
      }}
    >
      {/* The shake rides a wrapper inside the pill, not the pill itself, so
          only the wording moves — the box around it stays put. */}
      <Animated.View style={shake.style}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={light ? '#b0b0b0' : '#4d4d4d'}
          maxLength={maxLength}
          autoCapitalize={autoCapitalize}
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
          className="px-4 text-base text-center"
          style={[INPUT_TEXT_STYLE, { color: light ? '#111111' : '#ffffff', height: PILL_H, paddingVertical: 0 }]}
        />
      </Animated.View>
    </View>
  );
}

// The primary button above the keypad, running the full width of the sheet.
function ActionRow({ primaryLabel, onPrimary, disabled }) {
  return (
    <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
      <GlassPressable
        variant="active"
        radius={9999}
        disabled={disabled}
        onPress={onPrimary}
        style={{ paddingVertical: 16, alignItems: 'center' }}
      >
        <Text className="text-black text-base font-semibold">{primaryLabel}</Text>
      </GlassPressable>
    </View>
  );
}

// A labelled field row. The one being edited wears a green outline that fades in
// and out as the focus moves between rows, so it is always clear which one the
// keypad (or keyboard) is talking to.
function FieldRow({ label, active, onPress, shake, light, children }) {
  const on = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    on.value = withTiming(active ? 1 : 0, { duration: 180, easing: Easing.out(Easing.cubic) });
  }, [active, on]);
  const outline = useAnimatedStyle(() => ({
    borderColor: interpolateColor(on.value, [0, 1], [light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.07)', 'rgba(74,222,128,0.5)']),
  }));

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Animated.View
        style={[
          {
            height: 48, borderRadius: 14, borderWidth: 1, paddingHorizontal: 16,
            flexDirection: 'row', alignItems: 'center', gap: 10,
            backgroundColor: light ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.18)',
          },
          outline,
        ]}
      >
        <Text style={{ width: 56, fontSize: 13, color: light ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)' }}>{label}</Text>
        <Animated.View style={[{ flex: 1, justifyContent: 'center' }, shake.style]}>{children}</Animated.View>
      </Animated.View>
    </Pressable>
  );
}

// New goal / edit goal. The target is set on a ruler rather than typed: a goal
// is a round-ish number you feel your way to, not a figure you know to the
// rupee, and dragging to it is quicker (and more fun) than tapping it out.
//
// A goal opens at DEFAULT_TARGET rather than zero — an empty ruler gives the
// user nothing to adjust, and most goals are nearer a lakh than nothing.
const DEFAULT_TARGET = 100000;

export function GoalSheet({ open, onClose, goal, initialName = '', onSubmit, light = false }) {
  const isEdit = !!goal;
  const [name, setName] = useState('');
  const [target, setTarget] = useState(DEFAULT_TARGET);
  const [nameFocused, setNameFocused] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Bumped each time the sheet opens, which is what tells the ruler to go back
  // to the target it is being given rather than wherever it was left.
  const [session, setSession] = useState(0);
  const nameRef = useRef(null);
  const nameShake = useShake();
  const amountShake = useShake();

  useEffect(() => {
    if (!open) return;
    setName(goal ? goal.name : initialName);
    setTarget(goal ? goal.target : DEFAULT_TARGET);
    setNameFocused(false);
    setError('');
    setSubmitting(false);
    setSession(n => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // No closing mid-request — the result (and any error) would land on a sheet
  // the user can no longer see.
  const handleClose = useCallback(() => { if (!submitting) onClose(); }, [submitting, onClose]);

  async function handleSubmit() {
    if (submitting) return;
    const nameInvalid = !name.trim();
    const targetInvalid = !(target >= MIN_TARGET);
    if (nameInvalid || targetInvalid) {
      if (nameInvalid) nameShake.shake();
      if (targetInvalid) amountShake.shake();
      return;
    }
    Keyboard.dismiss();
    setSubmitting(true);
    setError('');
    const result = await onSubmit({ name, target });
    if (result?.success === false) {
      setSubmitting(false);
      setError(result.error || 'Something went wrong. Please try again.');
      return;
    }
    onClose();
  }

  const muted = light ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)';
  const surface = light ? '#FAFAF8' : '#161616';

  return (
    // Shorter than the sheets that carry a keypad — the ruler replaces it, and
    // a tall sheet with nothing in the bottom half reads as unfinished.
    <InlineSheet open={open} onClose={handleClose} light={light} heightRatio={0.6}>
      <ScrollView
        style={{ flexGrow: 0 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20 }}
        bounces={false}
        overScrollMode="never"
      >
        <Text
          className="text-center"
          style={{ fontSize: 21, fontWeight: '600', letterSpacing: -0.3, marginBottom: 18, color: light ? '#111111' : '#ffffff', fontFamily: ROUNDED_FONT }}
        >
          {isEdit ? 'Edit goal' : 'New goal'}
        </Text>

        <FieldRow label="Goal" active={nameFocused} onPress={() => nameRef.current?.focus()} shake={nameShake} light={light}>
          <TextInput
            ref={nameRef}
            value={name}
            onChangeText={setName}
            onFocus={() => setNameFocused(true)}
            onBlur={() => setNameFocused(false)}
            placeholder="Goal name"
            placeholderTextColor={light ? '#b0b0b0' : '#4d4d4d'}
            maxLength={60}
            autoCapitalize="sentences"
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
            style={[INPUT_TEXT_STYLE, { fontSize: 16, color: light ? '#111111' : '#ffffff', height: 48, paddingVertical: 0 }]}
          />
        </FieldRow>

        {/* Ideas for the name, only while there isn't one — once something is
            there they would just take up room. */}
        {!isEdit && !name.trim() && (
          <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={{ marginHorizontal: -20, marginTop: 8, flexGrow: 0 }}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
            >
              {GOAL_SUGGESTIONS.map(suggestion => (
                <GlassPressable
                  key={suggestion}
                  variant="field"
                  radius={9999}
                  onPress={() => { Keyboard.dismiss(); setName(suggestion); }}
                  accessibilityRole="button"
                  accessibilityLabel={suggestion}
                  style={{ paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: light ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)' }}
                >
                  <Text className="text-sm" style={{ color: light ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.65)' }}>{suggestion}</Text>
                </GlassPressable>
              ))}
            </ScrollView>
          </Animated.View>
        )}
      </ScrollView>

      {!!error && <Text className="text-red-400 text-base text-center mx-5 mb-2">{error}</Text>}

      {/* Whatever room is left between the name field and the button goes to
          the target, centred in it and nudged a little above true centre (the
          bottom padding). The ruler runs edge to edge, so only the label and
          the figure sit inside the sheet's own side padding. */}
      <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 24 }}>
        <Text className="text-center text-[13px]" style={{ color: muted }}>Target</Text>
        <Animated.View style={[{ alignItems: 'center', marginTop: 2, marginBottom: 6 }, amountShake.style]}>
          <RulerFigure value={target} light={light} />
        </Animated.View>

        <AmountRuler
          initialValue={isEdit ? goal.target : DEFAULT_TARGET}
          sessionKey={session}
          onChange={setTarget}
          light={light}
          surface={surface}
        />
      </View>

      <ActionRow
        primaryLabel={isEdit ? (submitting ? 'Saving' : 'Save') : (submitting ? 'Adding' : 'Add Goal')}
        onPrimary={handleSubmit}
        disabled={submitting}
      />
    </InlineSheet>
  );
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatDisplay(dateStr) {
  const todayStr = today();
  if (dateStr === todayStr) return 'Today';
  if (dateStr === shiftDate(todayStr, -1)) return 'Yesterday';
  const [year, month, day] = dateStr.split('-').map(Number);
  return `${day} ${MONTHS_SHORT[month - 1]} ${year}`;
}

function CalIcon({ color }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 14 14" fill="none">
      <Rect x="1" y="2.5" width="12" height="10.5" rx="2" stroke={color} strokeWidth="1.2" />
      <Line x1="1" y1="5.5" x2="13" y2="5.5" stroke={color} strokeWidth="1.2" />
      <Line x1="4.5" y1="1" x2="4.5" y2="4" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <Line x1="9.5" y1="1" x2="9.5" y2="4" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </Svg>
  );
}

// Add money to / withdraw from a goal, or edit an existing entry. This is the
// Add Transaction sheet with Add / Withdraw where Expense / Income would be:
// the same toggle, big amount, note pill, date field (which opens the same
// calendar over the button row and keypad) and keypad. It can't literally be
// AddModal — that is its own native Modal, and this page is already inside
// one — so it is built from the same pieces inside an InlineSheet instead.
export function MoneySheet({ open, onClose, goalName, entry, initialType = 'add', maxWithdraw = 0, onSubmit, onRequestDelete, light = false }) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isEdit = !!entry;
  const { amount, prevAmountLength, skipDigitAnim, onKeyPress, setProgrammatic } = useAmountEntry();
  const [type, setType] = useState('add');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(today());
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const amountShake = useShake();
  const noteShake = useShake();

  // The calendar is an independent overlay that slides up over the button row
  // and keypad, exactly as in AddModal — they stay mounted and unmoved
  // underneath. Its height is measured from that block so it can never end up
  // shorter than what it has to cover.
  const [calOpen, setCalOpen] = useState(false);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [ctaKeypadHeight, setCtaKeypadHeight] = useState(0);
  const calendarProgress = useSharedValue(0);
  useEffect(() => {
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
  const calendarCardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - calendarProgress.value) * 420 }],
  }));
  const closeCalendar = useCallback(() => setCalOpen(false), []);

  useEffect(() => {
    if (!open) {
      // Closing with the calendar up would otherwise leave it stuck visible
      // for the next opening — put it away immediately, unanimated.
      setCalOpen(false);
      setCalendarVisible(false);
      calendarProgress.value = 0;
      return;
    }
    setType(entry ? entry.type : initialType);
    setProgrammatic(entry ? String(entry.amount) : '');
    setNote(entry ? entry.note : '');
    setDate(entry ? entry.date : today());
    setError('');
    setSubmitting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleClose = useCallback(() => { if (!submitting) onClose(); }, [submitting, onClose]);

  async function handleSubmit() {
    if (submitting) return;
    const value = parseFloat(amount);
    if (!value || value <= 0) { amountShake.shake(); return; }
    // A new withdrawal can be checked here for a friendlier message; an edit
    // is checked by the hook, which knows what the entry's own change does.
    if (!isEdit && type === 'withdraw' && value > maxWithdraw) {
      amountShake.shake();
      setError(`Only ${formatCurrency(maxWithdraw)} is saved in ${goalName}.`);
      return;
    }
    Keyboard.dismiss();
    setSubmitting(true);
    setError('');
    const result = await onSubmit({ type, amount: value, note, date });
    if (result?.success === false) {
      setSubmitting(false);
      setError(result.error || 'Something went wrong. Please try again.');
      return;
    }
    onClose();
  }

  const muted = light ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)';
  // Full sheet width, like AddModal's toggle: the sheet's own 20px side
  // padding and the switch's 2px track padding come off, split across two.
  const toggleButtonWidth = Math.floor((windowWidth - 40 - 4) / 2);

  return (
    <InlineSheet open={open} onClose={handleClose} light={light}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
        bounces={false}
        overScrollMode="never"
      >
        <SegmentedSwitch
          options={MONEY_TYPES}
          value={type}
          onChange={setType}
          buttonWidth={toggleButtonWidth}
          trackColor="rgba(0,0,0,0.15)"
          light={light}
        />
        <Text className="text-center text-[13px]" numberOfLines={1} style={{ color: muted, marginTop: 22 }}>
          {goalName}
        </Text>
        <Animated.View style={[{ alignItems: 'center', marginTop: 6, marginBottom: 28 }, amountShake.style]}>
          <AmountRow
            amount={amount}
            prevAmountLength={prevAmountLength}
            skipDigitAnim={skipDigitAnim}
            light={light}
            digitFontSize={72}
            lineHeight={80}
            zeroColor={light ? 'rgba(0,0,0,0.82)' : 'rgba(255,255,255,0.82)'}
            weight="500"
          />
        </Animated.View>
        <TextPill
          value={note}
          onChangeText={setNote}
          placeholder="Note (optional)"
          maxLength={80}
          shake={noteShake}
          light={light}
        />
      </ScrollView>

      {!!error && <Text className="text-red-400 text-base text-center mx-5 mb-3">{error}</Text>}

      {/* Pinned to the bottom. The calendar overlay below is absolutely
          positioned against THIS wrapper, so it measures this block's real
          height and covers exactly the button row and keypad. */}
      <View style={{ marginTop: 'auto' }} onLayout={e => setCtaKeypadHeight(e.nativeEvent.layout.height)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 32, paddingBottom: 20 }}>
          <Pressable
            onPress={() => { Keyboard.dismiss(); setCalOpen(true); }}
            style={{ flexDirection: 'row', alignItems: 'center' }}
            accessibilityRole="button"
            accessibilityLabel="Choose date"
          >
            <CalIcon color={light ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)'} />
            <Text className="text-[15px]" style={{ marginLeft: 6, color: light ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)' }}>
              {formatDisplay(date)}
            </Text>
          </Pressable>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            {/* Editing an entry only: delete sits just left of Save, as an icon
                — the confirmation dialog does the "are you sure". */}
            {isEdit && (
              <Pressable
                onPress={onRequestDelete}
                disabled={submitting}
                hitSlop={8}
                style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                accessibilityRole="button"
                accessibilityLabel="Delete entry"
              >
                <TrashIcon size={20} color="rgba(248,113,113,0.8)" />
              </Pressable>
            )}
            <GlassPressable
              variant="active"
              radius={9999}
              disabled={submitting}
              onPress={handleSubmit}
              style={{ paddingHorizontal: 32, paddingVertical: 12, alignItems: 'center' }}
            >
              <Text className="text-black text-[15px] font-semibold">{submitting ? 'Saving…' : 'Save'}</Text>
            </GlassPressable>
          </View>
        </View>

        <NumericKeypad onKeyPress={onKeyPress} insetBottom={insets.bottom} light={light} />

        {/* Tap-outside-to-dismiss, behind the calendar and stretched past this
            wrapper (the sheet's own overflow:hidden clips it back down) so a
            tap anywhere else on the sheet closes it. */}
        {calendarVisible && (
          <Pressable
            style={{ position: 'absolute', top: -1000, left: 0, right: 0, bottom: 0, zIndex: 10, elevation: 10 }}
            onPress={closeCalendar}
          />
        )}

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
                // Opaque, not translucent — a see-through layer over the
                // keypad lets it bleed through as ghost digits.
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
    </InlineSheet>
  );
}
