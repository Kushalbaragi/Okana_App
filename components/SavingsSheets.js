import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Keyboard } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { GlassPressable, INPUT_TEXT_STYLE } from './Glass';
import { useShake } from '../hooks/useShake';
import AmountEntrySheet from './AmountEntrySheet';
import AddModal from './AddModal';
import { formatCurrency } from '../utils/format';
import { CloseIcon } from './icons';
import { KIND_COPY, DEBT_SUGGESTIONS } from './savingsShared';

// Ideas for a goal's name, offered under the name field and on the empty
// state. Tapping one just fills the name in; it can still be edited.
export const GOAL_SUGGESTIONS = ['Emergency fund', 'Vacation', 'Bike', 'Home', 'New phone', 'Wedding'];

// Ideas for where a goal's money sits, offered the same way as the name
// suggestions above. Not an exhaustive list or an enum — the field is free
// text, these are just a fast path for the common cases.
const LOCATION_SUGGESTIONS = ['Bank', 'Liquid Fund', 'Chit Fund', 'Cash'];

// Same idea, for a loan's "From" field — who it's owed to.
const DEBT_FROM_SUGGESTIONS = ['Bank', 'Friend', 'Family', 'NBFC'];

// Add/Withdraw modes handed to AddModal (see MoneySheet below) — the same
// ReelSlider toggle design Home's own Expense/Income uses, since this really
// is that same sheet now, not a separately-built lookalike.
const MONEY_MODES = ['add', 'withdraw'];
const MONEY_LABELS = { add: 'Add', withdraw: 'Withdraw' };

// Same boxed look as AmountEntrySheet's own name field (border, radius 12,
// dim fill, no focus ring, centred text, a clear "x" once there's something
// to clear) — used here so the loan's Where/Tenure/Paid fields read as the
// same kind of input as the name field above them, instead of the old
// labelled-row style that only these three ever used.
function BoxedField({ inputRef, value, onChangeText, onFocus, onBlur, placeholder, light, shake, keyboardType, maxLength, autoCapitalize, style }) {
  return (
    <Pressable onPress={() => inputRef.current?.focus()}>
      <View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderWidth: 1,
            borderRadius: 12,
            borderColor: light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
            backgroundColor: light ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.18)',
          },
          style,
        ]}
      >
        <Animated.View style={[{ flex: 1 }, shake.style]}>
          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={onChangeText}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder={placeholder}
            placeholderTextColor={light ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)'}
            keyboardType={keyboardType}
            maxLength={maxLength}
            autoCapitalize={autoCapitalize}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
            style={[INPUT_TEXT_STYLE, { fontSize: 16, color: light ? '#111111' : '#ffffff', textAlign: 'center', paddingVertical: 0 }]}
          />
        </Animated.View>
        {!!value && (
          <Pressable
            onPress={() => onChangeText('')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Clear"
            style={{
              marginLeft: 8,
              width: 18,
              height: 18,
              borderRadius: 9,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: light ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.16)',
            }}
          >
            <CloseIcon size={9} color={light ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.35)'} />
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

// New goal / edit goal. Built on AmountEntrySheet with `boxedNameField` —
// the same design Budget's own "Add plan" sheet uses (see AddBudgetItemSheet
// in BudgetPlan.js): a boxed name field, then the amount typed on the
// keypad below it. Deliberately not AddModal (see MoneySheet below, which
// does use it) — a goal's own name/target/location/tenure fields don't fit
// that sheet's shape, and this one already matches Budget's own look.
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
      <View style={{ marginHorizontal: 20, marginTop: 28 }}>
        <BoxedField
          inputRef={locationRef}
          value={location}
          onChangeText={setLocation}
          onFocus={() => setLocationFocused(true)}
          onBlur={() => setLocationFocused(false)}
          placeholder={copy.wherePlaceholder}
          maxLength={40}
          autoCapitalize="words"
          shake={locationShake}
          light={light}
        />
      </View>

      {/* Ideas for where the money sits — shown only once the field is
          actually focused, same as the name field's own suggestions above,
          rather than the moment the sheet opens. */}
      {locationFocused && !location.trim() && (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={{ marginBottom: 6 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={{ marginTop: 8, flexGrow: 0 }}
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
        <View style={{ marginHorizontal: 20, marginTop: 28, flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <BoxedField
              inputRef={tenureRef}
              value={tenureMonths}
              onChangeText={t => setTenureMonths(t.replace(/[^0-9]/g, '').slice(0, 3))}
              onFocus={() => setTenureFocused(true)}
              onBlur={() => setTenureFocused(false)}
              placeholder="Months"
              keyboardType="number-pad"
              maxLength={3}
              shake={tenureShake}
              light={light}
            />
          </View>
          <View style={{ flex: 1 }}>
            <BoxedField
              inputRef={emisPaidRef}
              value={emisPaidBefore}
              onChangeText={t => setEmisPaidBefore(t.replace(/[^0-9]/g, '').slice(0, 3))}
              onFocus={() => setEmisPaidFocused(true)}
              onBlur={() => setEmisPaidFocused(false)}
              placeholder="EMIs"
              keyboardType="number-pad"
              maxLength={3}
              shake={emisPaidShake}
              light={light}
            />
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
      title={isEdit ? copy.sheetTitleEdit : copy.sheetTitleNew}
      initialName={goal ? goal.name : initialName}
      namePlaceholder={copy.namePlaceholder}
      nameSuggestions={nameSuggestions}
      extraFields={(isEdit || kind === 'debt') ? extraFields : null}
      // Only the debt/edit case renders the extra Where/Tenure/Paid fields,
      // so only that case needs the taller 0.90 ratio. A plain new savings
      // goal has nothing below the name field, so it uses the smaller 0.72
      // instead of carrying that same tall sheet — which was leaving a big
      // dead gap between the amount and the keypad. Still a fixed number
      // either way, never left undefined: an undefined ratio falls back to
      // AmountEntrySheet's own dynamic ratio, which regrows the sheet's
      // height (a second, competing animation) the moment the chips show,
      // on top of the amount field's own scale/slide — exactly the
      // combination that read as sluggish. A fixed ratio keeps the sheet's
      // own height static so only that one transition plays, same as
      // Budget's own sheet (see AddBudgetItemSheet).
      heightRatio={(isEdit || kind === 'debt') ? 0.90 : 0.72}
      initialAmount={isEdit ? goal.target : 0}
      amountLabel={copy.amountFieldLabel}
      submitLabel={isEdit ? 'Save' : copy.submitLabel}
      onSubmit={handleSubmit}
      boxedNameField
    />
  );
}

// Add money to / withdraw from a goal, or edit an existing entry — now a
// thin wrapper around the same AddModal Home uses for its own transactions
// (see AddModal's own comment on the props that make this a real second
// caller), rather than a separately-built lookalike sheet. Debt only ever
// logs a payment — no Withdraw side to a loan — so its own modes list has
// just the one entry, which also skips AddModal's toggle entirely.
const DEBT_MONEY_MODES = ['add'];

export function MoneySheet({ open, onClose, onClosed, goalName, entry, initialType = 'add', maxWithdraw = 0, onSubmit, light = false, kind = 'savings' }) {
  const isEdit = !!entry;

  // AddModal's own {type, amount, date, description} shape, mapped to and
  // from this sheet's {type, amount, date, note} — a savings/debt entry has
  // a "note", not a "description", everywhere else it's used.
  const editData = entry ? { type: entry.type, amount: entry.amount, date: entry.date, description: entry.note } : null;
  const handleAdd = useCallback(({ type, amount, date, description }) => (
    onSubmit({ type, amount, date, note: description })
  ), [onSubmit]);
  const handleEdit = useCallback((_id, { type, amount, date, description }) => (
    onSubmit({ type, amount, date, note: description })
  ), [onSubmit]);

  // A new withdrawal is checked here for a friendlier message; an edit is
  // checked by the hook, which knows what the entry's own change does.
  // Debt never offers Withdraw (see DEBT_MONEY_MODES above), so `type`
  // can't actually be 'withdraw' for a debt entry — this is a no-op there.
  const validateWithdraw = useCallback((type, value) => (
    !isEdit && type === 'withdraw' && value > maxWithdraw
      ? `Only ${formatCurrency(maxWithdraw)} is saved in ${goalName}.`
      : null
  ), [isEdit, maxWithdraw, goalName]);

  return (
    <AddModal
      open={open}
      onClose={onClose}
      onClosed={onClosed}
      onAdd={handleAdd}
      onEdit={handleEdit}
      editData={editData}
      modes={kind === 'debt' ? DEBT_MONEY_MODES : MONEY_MODES}
      labels={MONEY_LABELS}
      // A touch wider than AddModal's own default slot — "Withdraw" is
      // longer than "Add", and at the default width the two labels read as
      // crowded together (see ReelSlider's own comment on what this does).
      sliderSlot={80}
      initialMode={initialType}
      subtitle={goalName}
      fieldPlaceholder="Note (optional)"
      fieldRequired={false}
      extraValidate={validateWithdraw}
      light={light}
    />
  );
}
