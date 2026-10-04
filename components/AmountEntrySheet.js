import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Keyboard } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InlineSheet, OPEN_MS } from './InlineSheet';
import { GlassPressable, INPUT_TEXT_STYLE } from './Glass';
import { useShake } from '../hooks/useShake';
import { useAmountEntry } from '../hooks/useAmountEntry';
import { AmountRow } from './AmountField';
import { NumericKeypad, DIGIT_ONLY_KEYPAD_ROWS } from './NumericKeypad';
import { textColor } from '../utils/colors';
import { SPRING_QUICK, layoutTransition } from '../utils/motion';
import { CloseIcon } from './icons';
import { FONT } from '../utils/type';

// The chips row (below) mounting/unmounting above the amount section is
// what actually moves it down/up — ordinary layout reflow from a sibling
// appearing, not a transform of its own. `layout` is what turns that into
// a slide instead of an instant snap: Reanimated diffs this element's own
// old and new measured frame across the reflow and tweens between them.
// SPRING_QUICK, not SPRING_SMOOTH — this fires the instant the name field
// is tapped (chips appear on focus alone, before anything is typed), so it
// reads as a direct response to that tap rather than a delayed reflow.
// SPRING_SMOOTH's calmer, slightly slower settle was left over from
// treating this like a passive list reflow; it made the amount field's
// drop feel sluggish off the mark.
const AMOUNT_POSITION_TRANSITION = layoutTransition(SPRING_QUICK);

const COMPACT_RATIO = 0.72;
const EXPANDED_RATIO = 0.80;

export default function AmountEntrySheet({
  open, onClose, onClosed, light = false,
  heightRatio,
  initialName = '',
  namePlaceholder,
  nameSuggestions = [],
  extraFields = null,
  initialAmount = 0,
  amountLabel = 'Amount',
  amountHint,
  minAmount = 1,
  submitLabel = 'Add',
  onSubmit,
  // The name field is a plain underline by default. Budget's AddBudgetItemSheet
  // and Savings' GoalSheet (both goals and loans) ask for a bordered box
  // instead — kept opt-in since it was added for those two, not as the
  // sheet's only look.
  boxedNameField = false,
  // Optional heading above the name field — no caller passed one before
  // Budget's own sheet asked for it, so it's opt-in and every other sheet
  // (Savings included) renders exactly as it did before.
  title,
}) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [nameFocused, setNameFocused] = useState(false);
  const showChips = nameFocused && !name.trim() && nameSuggestions.length > 0;
  const ratio = heightRatio ?? (showChips ? EXPANDED_RATIO : COMPACT_RATIO);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const nameRef = useRef(null);
  const nameShake = useShake();
  const amountShake = useShake();
  const { amount, prevAmountLength, skipDigitAnim, onKeyPress, setProgrammatic } = useAmountEntry();

  // Budget's boxed sheet only (see amountScaleStyle below) — the chips
  // row appearing between the name field and the amount already pushes
  // the amount down, which is the wanted behaviour; shrinking it a touch
  // at the same time is what makes that push read as a deliberate "make
  // room" gesture rather than the amount just getting shoved out of the
  // way.
  //
  // Easing.inOut, not SETTLE_EASING — SETTLE_EASING is front-loaded (fast
  // off the mark, then a long gentle tail), which suits something arriving
  // into place but reads as an abrupt snap on a shrink/grow: most of the
  // size change happens almost instantly, with a barely-perceptible tail
  // after. inOut ramps into and out of the motion at both ends, which is
  // what actually reads as a smooth scale rather than a cut. 180ms, kept
  // in lockstep with AMOUNT_POSITION_TRANSITION's own SPRING_QUICK settle
  // above it — the shrink and the slide are one motion, not two.
  const amountScale = useSharedValue(1);
  useEffect(() => {
    if (!boxedNameField) return;
    amountScale.value = withTiming(showChips ? 0.82 : 1, { duration: 180, easing: Easing.inOut(Easing.cubic) });
  }, [showChips, boxedNameField, amountScale]);
  const amountScaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: amountScale.value }] }));

  // Clear state after the close animation finishes (sheet is off-screen).
  // Next open starts with a clean slate — no old digits to flash.
  const handleClosed = useCallback(() => {
    setProgrammatic('');
    setName('');
    setNameFocused(false);
    setError('');
    setSubmitting(false);
    onClosed?.();
  }, [onClosed, setProgrammatic]);

  // Set initial values + force-remount AmountRow (via resetKey) so
  // Reanimated never plays exit animations for stale digits.
  useLayoutEffect(() => {
    if (!open) return;
    setName(initialName);
    setProgrammatic(initialAmount > 0 ? String(initialAmount) : '');
    setNameFocused(false);
    setError('');
    setSubmitting(false);
    setResetKey(k => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Gates the amount section's own `layout` transition (AMOUNT_POSITION_
  // TRANSITION below) off until the sheet's own open slide has actually
  // finished. Resetting a couple of things above (the amount back to
  // empty/initial, a fresh resetKey) changes that section's measured
  // size right as it opens — with the transition live from the very first
  // frame, that reflow played its own little slide layered on top of the
  // sheet's real one, reading as the open motion stopping partway and
  // restarting rather than one continuous slide. Held off for exactly as
  // long as InlineSheet's own open animation takes, so it's only ever
  // live for a later, genuine focus/blur while the sheet is already still.
  const [positionReady, setPositionReady] = useState(false);
  useEffect(() => {
    if (!open) { setPositionReady(false); return; }
    const t = setTimeout(() => setPositionReady(true), OPEN_MS);
    return () => clearTimeout(t);
  }, [open]);

  const handleClose = useCallback(() => { if (!submitting) onClose(); }, [submitting, onClose]);

  // A tap anywhere else in the sheet (not the name field itself, which
  // claims its own touch via its own Pressable and never reaches this
  // one) blurs the name field and drops the keyboard — which also takes
  // the suggestion chips with it, since they're only ever shown while the
  // name field is focused (see showChips above).
  const dismissNameField = useCallback(() => {
    nameRef.current?.blur();
    Keyboard.dismiss();
  }, []);

  async function handleSubmit() {
    if (submitting) return;
    const nameInvalid = !name.trim();
    const value = parseInt(amount, 10) || 0;
    const amountInvalid = value < minAmount;
    if (nameInvalid || amountInvalid) {
      if (nameInvalid) nameShake.shake();
      if (amountInvalid) amountShake.shake();
      return;
    }
    Keyboard.dismiss();
    setSubmitting(true);
    setError('');
    const result = await onSubmit({ name: name.trim(), amount: value });
    if (result?.success === false) {
      setSubmitting(false);
      if (!result.offline) setError(result.error || 'Something went wrong. Please try again.');
      return;
    }
    onClose();
  }

  const muted = textColor(light).tertiary;
  const borderIdle = light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
  const borderActive = 'rgba(74,222,128,0.4)';

  const footer = (
    <View>
      <NumericKeypad
        onKeyPress={onKeyPress}
        rows={DIGIT_ONLY_KEYPAD_ROWS}
        insetBottom={0}
        light={light}
      />
      <View style={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 10 }}>
        <GlassPressable
          variant="active"
          radius={14}
          disabled={submitting}
          onPress={handleSubmit}
          style={{ paddingVertical: 16, alignItems: 'center' }}
        >
          <Text className="text-black text-base font-semibold">{submitLabel}</Text>
        </GlassPressable>
      </View>
    </View>
  );

  return (
    <InlineSheet
      open={open}
      onClose={handleClose}
      onClosed={handleClosed}
      light={light}
      heightRatio={ratio}
      dismissible={!submitting}
      footer={footer}
    >
      <Pressable style={{ flex: 1 }} onPress={dismissNameField}>
        {!!title && (
          <Text
            className="text-center font-semibold"
            style={{ fontSize: FONT.body, color: textColor(light).primary, marginBottom: 14 }}
          >
            {title}
          </Text>
        )}
        <Pressable onPress={() => nameRef.current?.focus()}>
          <View style={boxedNameField ? {
            marginHorizontal: 20,
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderWidth: 1,
            borderRadius: 12,
            // Always idle — no green focus ring on this variant, unlike
            // the underline below. Budget's own box is meant to read as a
            // plain, static field, not one with its own focus affordance.
            borderColor: borderIdle,
            backgroundColor: light ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.18)',
            // Row, not the default variant's plain column — makes room for
            // the clear button beside the text instead of on top of it.
            flexDirection: 'row',
            alignItems: 'center',
          } : {
            marginHorizontal: 20,
            paddingVertical: 14,
            borderBottomWidth: 1,
            borderBottomColor: nameFocused ? borderActive : borderIdle,
            alignItems: 'center',
          }}>
            <Animated.View style={[boxedNameField ? { flex: 1 } : null, nameShake.style]}>
              <TextInput
                ref={nameRef}
                value={name}
                onChangeText={setName}
                onFocus={() => setNameFocused(true)}
                onBlur={() => setNameFocused(false)}
                placeholder={namePlaceholder}
                placeholderTextColor={light ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)'}
                maxLength={60}
                autoCapitalize="sentences"
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
                style={[INPUT_TEXT_STYLE, {
                  fontSize: boxedNameField ? 16 : 20, fontWeight: '400',
                  color: light ? '#111111' : '#ffffff',
                  textAlign: 'center',
                  paddingVertical: 0, width: '100%',
                }]}
              />
            </Animated.View>
            {/* Clearing the whole line at once, rather than backspacing it
                out character by character — only where there's something
                to clear, and only on Budget's own boxed field (the
                underline variant never asked for this). */}
            {boxedNameField && !!name && (
              <Pressable
                onPress={() => setName('')}
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

        {nameFocused && !name.trim() && nameSuggestions.length > 0 && (
          <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={{ marginTop: 10, flexGrow: 0 }}
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
                  <Text className="text-[13px]" style={{ color: light ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.65)' }}>{suggestion}</Text>
                </GlassPressable>
              ))}
            </ScrollView>
          </Animated.View>
        )}

        {extraFields}

        {!!error && <Text className="text-red-400 text-[13px] text-center mx-5 mt-2">{error}</Text>}

        {/* flex:1 + center for every caller but Budget's own boxed sheet —
            that's what lets the amount vertically centre in whatever room
            is left below the name field/chips, regardless of how much
            content sits above it. Budget's sheet instead pins this with a
            fixed marginTop, same as AddModal's own Add Transaction sheet.
            Neither wrapper here sets alignItems:'center' for the boxed
            case (unlike the default branch) — a shrink-wrapped, centered
            ancestor re-measures and re-centers itself on every keystroke
            (the row's own width changes as a digit is added), an instant
            snap that fights the row's own AMOUNT_LAYOUT_TRANSITION spring
            mid-flight and reads as a jump rather than one continuous
            slide. Leaving both ancestors at their default stretch instead
            gives AmountRow's own row a full, stable width to move within,
            so its own `justify-content:'center'` (see its className) plus
            its already-present `layout` transition are the only thing
            animating anything — nothing above it ever needs to react to
            how wide it currently is. */}
        <Animated.View
          layout={boxedNameField && positionReady ? AMOUNT_POSITION_TRANSITION : undefined}
          style={boxedNameField
            ? { marginHorizontal: 20, marginTop: 20 }
            : { flex: 1, justifyContent: 'center', alignItems: 'center' }}
        >
          {!!amountLabel && (
            <Text className="text-center" style={{ fontSize: FONT.caption, color: muted }}>{amountLabel}</Text>
          )}
          {!!amountHint && (
            <Text className="text-center" style={{ fontSize: FONT.label, color: muted, opacity: 0.6, marginTop: 2 }}>{amountHint}</Text>
          )}
          <Animated.View key={resetKey} style={[{ marginTop: 4 }, boxedNameField ? null : { alignItems: 'center' }, amountShake.style, amountScaleStyle]}>
            <AmountRow
              amount={amount}
              prevAmountLength={prevAmountLength}
              skipDigitAnim={skipDigitAnim}
              light={light}
              digitFontSize={56}
              lineHeight={64}
              zeroColor={light ? 'rgba(0,0,0,0.82)' : 'rgba(255,255,255,0.82)'}
              weight="400"
              letterSpacing={-2.2}
              autoShrink={false}
            />
          </Animated.View>
        </Animated.View>
      </Pressable>
    </InlineSheet>
  );
}
