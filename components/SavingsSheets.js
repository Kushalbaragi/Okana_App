import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Keyboard, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS, FadeIn, FadeOut } from 'react-native-reanimated';
import { InlineSheet } from './InlineSheet';
import SegmentedSwitch from './SegmentedSwitch';
import CalendarPicker from './CalendarPicker';
import { NumericKeypad } from './NumericKeypad';
import { useAmountEntry } from '../hooks/useAmountEntry';
import { AmountRow } from './AmountField';
import { GlassPressable, INPUT_TEXT_STYLE } from './Glass';
import { useShake } from '../hooks/useShake';
import AmountEntrySheet, { FieldRow } from './AmountEntrySheet';
import { GOAL_SCALE } from './AmountRuler';
import { formatCurrency, formatDayLabel, today } from '../utils/format';
import { CalendarIcon } from './icons';
import { textColor } from '../utils/colors';
import { KIND_COPY, DEBT_SUGGESTIONS } from './savingsShared';

// Same as AddModal's description pill, so the two sheets read as one family.
const PILL_H = 40;

// Ideas for a goal's name, offered under the name field and on the empty
// state. Tapping one just fills the name in; it can still be edited.
export const GOAL_SUGGESTIONS = ['Emergency fund', 'Vacation', 'Bike', 'Home', 'New phone', 'Wedding'];

// Ideas for where a goal's money sits, offered the same way as the name
// suggestions above. Not an exhaustive list or an enum — the field is free
// text, these are just a fast path for the common cases.
const LOCATION_SUGGESTIONS = ['Bank', 'Liquid Fund', 'Chit Fund', 'Cash'];

// Same idea, for a loan's "From" field — who it's owed to.
const DEBT_FROM_SUGGESTIONS = ['Bank', 'Friend', 'Family', 'NBFC'];

const MONEY_TYPES = [
  { id: 'add', label: 'Add' },
  { id: 'withdraw', label: 'Withdraw' },
];

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

// New goal / edit goal. The target is set on a ruler rather than typed: a goal
// is a round-ish number you feel your way to, not a figure you know to the
// rupee, and dragging to it is quicker (and more fun) than tapping it out.
//
// A goal opens at DEFAULT_TARGET rather than zero — an empty ruler gives the
// user nothing to adjust, and most goals are nearer a lakh than nothing.
const DEFAULT_TARGET = 100000;

export function GoalSheet({ open, onClose, onClosed, goal, initialName = '', onSubmit, light = false, kind = 'savings' }) {
  const isEdit = !!goal;
  const copy = KIND_COPY[kind];
  const nameSuggestions = isEdit ? [] : (kind === 'debt' ? DEBT_SUGGESTIONS : GOAL_SUGGESTIONS);
  const fromSuggestions = kind === 'debt' ? DEBT_FROM_SUGGESTIONS : LOCATION_SUGGESTIONS;

  // Debt's own extra fields (Where/From, Tenure, Already paid) — owned here,
  // not by the shared sheet, and merged into its `{ name, amount }` at
  // submit time. Reset on every open, same as the shared sheet's own name
  // and amount.
  const [location, setLocation] = useState('');
  const [tenureMonths, setTenureMonths] = useState('');
  const [emisPaidBefore, setEmisPaidBefore] = useState('');
  const [locationFocused, setLocationFocused] = useState(false);
  const [tenureFocused, setTenureFocused] = useState(false);
  const [emisPaidFocused, setEmisPaidFocused] = useState(false);
  const locationRef = useRef(null);
  const tenureRef = useRef(null);
  const emisPaidRef = useRef(null);
  const locationShake = useShake();
  const tenureShake = useShake();
  const emisPaidShake = useShake();

  useEffect(() => {
    if (!open) return;
    setLocation(goal ? goal.location : '');
    setTenureMonths(goal?.tenureMonths ? String(goal.tenureMonths) : '');
    setEmisPaidBefore(goal?.emisPaidBefore ? String(goal.emisPaidBefore) : '');
    setLocationFocused(false);
    setTenureFocused(false);
    setEmisPaidFocused(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSubmit = useCallback(({ name, amount }) => {
    const tenure = kind === 'debt' && parseInt(tenureMonths, 10) > 0 ? parseInt(tenureMonths, 10) : null;
    const paidBefore = kind === 'debt' && parseInt(emisPaidBefore, 10) > 0 ? parseInt(emisPaidBefore, 10) : 0;
    return onSubmit({ name, target: amount, location, kind, tenureMonths: tenure, emisPaidBefore: paidBefore });
  }, [onSubmit, kind, location, tenureMonths, emisPaidBefore]);

  const extraFields = (
    <>
      <View style={{ marginTop: 28 }}>
        <FieldRow label={copy.whereFieldLabel} active={locationFocused} onPress={() => locationRef.current?.focus()} shake={locationShake} light={light}>
          <TextInput
            ref={locationRef}
            value={location}
            onChangeText={setLocation}
            onFocus={() => setLocationFocused(true)}
            onBlur={() => setLocationFocused(false)}
            placeholder={copy.wherePlaceholder}
            placeholderTextColor={light ? '#b0b0b0' : '#4d4d4d'}
            maxLength={40}
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
            style={[INPUT_TEXT_STYLE, { fontSize: 16, color: light ? '#111111' : '#ffffff', height: 48, paddingVertical: 0 }]}
          />
        </FieldRow>
      </View>

      {/* Ideas for where the money sits, only while there isn't one — same
          pattern as the shared sheet's own name suggestions. */}
      {!location.trim() && (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={{ marginBottom: 6 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={{ marginHorizontal: -20, marginTop: 8, flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
          >
            {fromSuggestions.map(suggestion => (
              <GlassPressable
                key={suggestion}
                variant="field"
                radius={9999}
                onPress={() => { Keyboard.dismiss(); setLocation(suggestion); }}
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

      {/* Debt only: how many EMIs the loan runs for, and how many were
          already paid before it was added here — most loans aren't added
          on day one. Both optional, so its page can show "34 of 60 paid,
          26 left" instead of restarting the count from zero. */}
      {kind === 'debt' && (
        <View style={{ marginTop: 28, flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <FieldRow label={copy.tenureFieldLabel} active={tenureFocused} onPress={() => tenureRef.current?.focus()} shake={tenureShake} light={light}>
              <TextInput
                ref={tenureRef}
                value={tenureMonths}
                onChangeText={t => setTenureMonths(t.replace(/[^0-9]/g, '').slice(0, 3))}
                onFocus={() => setTenureFocused(true)}
                onBlur={() => setTenureFocused(false)}
                placeholder="Months"
                placeholderTextColor={light ? '#b0b0b0' : '#4d4d4d'}
                keyboardType="number-pad"
                maxLength={3}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
                style={[INPUT_TEXT_STYLE, { fontSize: 16, color: light ? '#111111' : '#ffffff', height: 48, paddingVertical: 0 }]}
              />
            </FieldRow>
          </View>
          <View style={{ flex: 1 }}>
            <FieldRow label={copy.alreadyPaidFieldLabel} active={emisPaidFocused} onPress={() => emisPaidRef.current?.focus()} shake={emisPaidShake} light={light}>
              <TextInput
                ref={emisPaidRef}
                value={emisPaidBefore}
                onChangeText={t => setEmisPaidBefore(t.replace(/[^0-9]/g, '').slice(0, 3))}
                onFocus={() => setEmisPaidFocused(true)}
                onBlur={() => setEmisPaidFocused(false)}
                placeholder="EMIs"
                placeholderTextColor={light ? '#b0b0b0' : '#4d4d4d'}
                keyboardType="number-pad"
                maxLength={3}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
                style={[INPUT_TEXT_STYLE, { fontSize: 16, color: light ? '#111111' : '#ffffff', height: 48, paddingVertical: 0 }]}
              />
            </FieldRow>
          </View>
        </View>
      )}
    </>
  );

  return (
    <AmountEntrySheet
      open={open}
      onClose={onClose}
      onClosed={onClosed}
      light={light}
      heightRatio={0.74}
      title={isEdit ? copy.sheetTitleEdit : copy.sheetTitleNew}
      initialName={goal ? goal.name : initialName}
      nameLabel={copy.nameFieldLabel}
      namePlaceholder={copy.namePlaceholder}
      nameSuggestions={nameSuggestions}
      extraFields={extraFields}
      initialAmount={isEdit ? goal.target : DEFAULT_TARGET}
      amountLabel={copy.amountFieldLabel}
      amountHint={kind === 'debt' ? "What's owed today, not the original loan amount" : undefined}
      scale={GOAL_SCALE}
      submitLabel={isEdit ? 'Save' : copy.submitLabel}
      onSubmit={handleSubmit}
    />
  );
}

// Add money to / withdraw from a goal, or edit an existing entry. This is the
// Add Transaction sheet with Add / Withdraw where Expense / Income would be:
// the same toggle, big amount, note pill, date field (which opens the same
// calendar over the button row and keypad) and keypad. It can't literally be
// AddModal — that is its own native Modal, and this page is already inside
// one — so it is built from the same pieces inside an InlineSheet instead.
export function MoneySheet({ open, onClose, onClosed, goalName, entry, initialType = 'add', maxWithdraw = 0, onSubmit, light = false, kind = 'savings' }) {
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
    // Debt never offers Withdraw (see the switch below), so `type` can't
    // actually be 'withdraw' for a debt entry — this guard is a no-op there.
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
      // Offline: the app's offline banner has said so, and the sheet stays open
      // to try again — no red message on top of it.
      if (!result.offline) setError(result.error || 'Something went wrong. Please try again.');
      return;
    }
    onClose();
  }

  const muted = textColor(light).tertiary;
  // Full sheet width, like AddModal's toggle: the sheet's own 20px side
  // padding and the switch's 2px track padding come off, split across two.
  const toggleButtonWidth = Math.floor((windowWidth - 40 - 4) / 2);

  // Pinned to the bottom and kept out of the sheet's drag area: a drag that starts
  // on a key or the Save button fights the gesture for the touch. The calendar
  // overlay inside is absolutely positioned against this wrapper, so it measures
  // this block's real height and covers exactly the button row and keypad.
  const footer = (
    <View style={{ marginTop: 'auto' }} onLayout={e => setCtaKeypadHeight(e.nativeEvent.layout.height)}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 32, paddingBottom: 20 }}>
        <Pressable
          onPress={() => { Keyboard.dismiss(); setCalOpen(true); }}
          style={{ flexDirection: 'row', alignItems: 'center' }}
          accessibilityRole="button"
          accessibilityLabel="Choose date"
        >
          <CalendarIcon color={light ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)'} />
          <Text className="text-[15px]" style={{ marginLeft: 6, color: light ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)' }}>
            {formatDayLabel(date)}
          </Text>
        </Pressable>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <GlassPressable
            variant="active"
            radius={9999}
            disabled={submitting}
            onPress={handleSubmit}
            style={{ paddingHorizontal: 32, paddingVertical: 12, alignItems: 'center' }}
          >
            <Text className="text-black text-[15px] font-semibold">Save</Text>
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
  );

  return (
    <InlineSheet open={open} onClose={handleClose} onClosed={onClosed} light={light} dismissible={!submitting} footer={footer}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
        bounces={false}
        overScrollMode="never"
      >
        {/* Debt only ever logs a payment — no Withdraw side to a loan, so
            the toggle that exists purely to pick a direction has nothing
            to pick between and is skipped entirely. */}
        {kind !== 'debt' && (
          <SegmentedSwitch
            options={MONEY_TYPES}
            value={type}
            onChange={setType}
            buttonWidth={toggleButtonWidth}
            trackColor="rgba(0,0,0,0.15)"
            light={light}
          />
        )}
        <Text className="text-center text-[13px]" numberOfLines={1} style={{ color: muted, marginTop: kind === 'debt' ? 0 : 22 }}>
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

    </InlineSheet>
  );
}
