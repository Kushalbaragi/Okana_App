import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Keyboard } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, interpolateColor, FadeIn, FadeOut } from 'react-native-reanimated';
import { InlineSheet } from './InlineSheet';
import { GlassPressable, INPUT_TEXT_STYLE } from './Glass';
import { useShake } from '../hooks/useShake';
import AmountRuler, { RulerFigure, GOAL_SCALE } from './AmountRuler';
import { dim } from './savingsShared';
import { textColor } from '../utils/colors';

// The one "create something with a name and an amount" sheet — a new savings
// goal, a new loan, or a new Budget Plan line all used to have their own copy
// of this shell; now they share it, each supplying only what makes it theirs
// (its title, its labels, its suggestion chips, its amount scale, and — for
// debt's tenure/paid fields — an `extraFields` slot).

// A labelled field row. The one being edited wears a green outline that fades in
// and out as the focus moves between rows, so it is always clear which one the
// keypad (or keyboard) is talking to.
export function FieldRow({ label, active, onPress, shake, light, children }) {
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
        <Text style={{ width: 56, fontSize: 13, color: textColor(light).tertiary }}>{label}</Text>
        <Animated.View style={[{ flex: 1, justifyContent: 'center' }, shake.style]}>{children}</Animated.View>
      </Animated.View>
    </Pressable>
  );
}

// The primary button above the ruler, running the full width of the sheet.
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

// `onSubmit` gets `{ name, amount }` once both pass validation — the caller
// merges in anything else it owns (a loan's tenure fields, say) and does the
// actual write, returning the usual `{ success, error?, offline? }`.
// `extraFields` is optional JSX rendered under the name suggestions, still
// inside the scrollable top section — a loan's Where/Tenure/Paid fields, for
// instance, built from the exported `FieldRow` above by the caller.
export default function AmountEntrySheet({
  open, onClose, onClosed, light = false,
  heightRatio = 0.74,
  title,
  initialName = '',
  nameLabel = 'Name',
  namePlaceholder,
  nameSuggestions = [],
  extraFields = null,
  initialAmount,
  amountLabel = 'Amount',
  amountHint,
  scale = GOAL_SCALE,
  minAmount = scale.min,
  submitLabel = 'Add',
  onSubmit,
}) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState(initialAmount);
  const [nameFocused, setNameFocused] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Bumped each time the sheet opens, which is what tells the ruler to go back
  // to the amount it is being given rather than wherever it was left.
  const [session, setSession] = useState(0);
  const nameRef = useRef(null);
  const nameShake = useShake();
  const amountShake = useShake();

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setAmount(initialAmount);
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
    const amountInvalid = !(amount >= minAmount);
    if (nameInvalid || amountInvalid) {
      if (nameInvalid) nameShake.shake();
      if (amountInvalid) amountShake.shake();
      return;
    }
    Keyboard.dismiss();
    setSubmitting(true);
    setError('');
    const result = await onSubmit({ name: name.trim(), amount });
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
  const surface = light ? '#FAFAF8' : '#161616';

  return (
    // Shorter than the sheets that carry a keypad — the ruler replaces it, and
    // a tall sheet with nothing in the bottom half reads as unfinished.
    <InlineSheet
      open={open}
      onClose={handleClose}
      onClosed={onClosed}
      light={light}
      heightRatio={heightRatio}
      dismissible={!submitting}
      footer={<ActionRow primaryLabel={submitLabel} onPrimary={handleSubmit} disabled={submitting} />}
    >
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
          style={{ fontSize: 21, fontWeight: '500', letterSpacing: -0.3, marginBottom: 18, color: light ? '#111111' : '#ffffff' }}
        >
          {title}
        </Text>

        <FieldRow label={nameLabel} active={nameFocused} onPress={() => nameRef.current?.focus()} shake={nameShake} light={light}>
          <TextInput
            ref={nameRef}
            value={name}
            onChangeText={setName}
            onFocus={() => setNameFocused(true)}
            onBlur={() => setNameFocused(false)}
            placeholder={namePlaceholder}
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
        {!name.trim() && nameSuggestions.length > 0 && (
          <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={{ marginHorizontal: -20, marginTop: 8, flexGrow: 0 }}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
            >
              {nameSuggestions.map(suggestion => (
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

        {extraFields}
      </ScrollView>

      {!!error && <Text className="text-red-400 text-base text-center mx-5 mb-2">{error}</Text>}

      {/* Whatever room is left between the name field and the button goes to
          the amount, centred in it and nudged a little above true centre (the
          bottom padding). The ruler runs edge to edge, so only the label and
          the figure sit inside the sheet's own side padding. */}
      <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 24 }}>
        <Text className="text-center text-[13px]" style={{ color: muted }}>{amountLabel}</Text>
        {!!amountHint && (
          <Text className="text-center text-[11px]" style={{ color: dim(light, 0.35), marginTop: 2 }}>{amountHint}</Text>
        )}
        <Animated.View style={[{ alignItems: 'center', marginTop: 2, marginBottom: 6 }, amountShake.style]}>
          <RulerFigure value={amount} light={light} />
        </Animated.View>

        <AmountRuler
          scale={scale}
          initialValue={initialAmount}
          sessionKey={session}
          onChange={setAmount}
          light={light}
          surface={surface}
        />
      </View>
    </InlineSheet>
  );
}
