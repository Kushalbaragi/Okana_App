import { memo } from 'react';
import { View, Pressable, Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { BackspaceIcon } from './icons';

// Same 'ui-rounded' identifier used for the amount fields elsewhere in the
// app — 'SF Pro Rounded' isn't a resolvable name and silently falls back to
// plain SF Pro (see AmountField.js's own ROUNDED_FONT comment).
const ROUNDED_FONT = Platform.OS === 'ios' ? 'ui-rounded' : undefined;

// Default layout — Amount entry (digits + decimal point). Screens that only
// need digits (e.g. an OTP code) pass their own `rows` with a blank spacer
// cell instead of '.'.
export const DECIMAL_KEYPAD_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', 'backspace'],
];

export const DIGIT_ONLY_KEYPAD_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  [null, '0', 'backspace'],
];

// Canonical "what does this key do to an amount string" rule — shared by
// every caller that feeds NumericKeypad amount digits (Add Transaction,
// Budget setup), so the digit-entry rules can't drift apart between them.
export function nextAmountValue(prev, key) {
  if (key === 'backspace') return prev.slice(0, -1);
  if (key === '.') {
    if (prev.includes('.')) return prev;
    return prev === '' ? '0.' : `${prev}.`;
  }
  if (prev === '0') return key;
  const decimals = prev.split('.')[1];
  if (decimals != null && decimals.length >= 2) return prev; // max 2 decimal places
  if (prev.replace('.', '').length >= 8) return prev; // sane upper bound
  return prev + key;
}

// Flat, no per-key box — just the digit sitting on the page background.
// Feedback on tap comes from a Reanimated scale+dim on the label itself
// (driven via onPressIn/onPressOut, not the Pressable's own style prop — a
// function-style prop on Pressable doesn't reliably apply in this
// NativeWind setup, same issue GlassPressable works around).
function KeypadKey({ label, onPress, color = '#ffffff' }) {
  const pressProgress = useSharedValue(0);

  if (label == null) {
    // Blank spacer — keeps the grid's column alignment without a live key.
    return <View style={{ flex: 1, height: 64 }} />;
  }

  function handlePressIn() {
    pressProgress.value = withTiming(1, { duration: 90, easing: Easing.out(Easing.cubic) });
  }
  function handlePressOut() {
    pressProgress.value = withTiming(0, { duration: 160, easing: Easing.out(Easing.cubic) });
  }

  const animStyle = useAnimatedStyle(() => ({
    opacity: 1 - pressProgress.value * 0.5,
    transform: [{ scale: 1 - pressProgress.value * 0.15 }],
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={{ flex: 1, height: 64, alignItems: 'center', justifyContent: 'center' }}
      accessibilityRole="button"
      accessibilityLabel={label === 'backspace' ? 'Delete' : label}
    >
      {label === 'backspace' ? (
        <Animated.View style={animStyle}>
          <BackspaceIcon size={24} color={color} />
        </Animated.View>
      ) : (
        <Animated.Text style={[{ color, fontSize: 30, fontWeight: '600', fontFamily: ROUNDED_FONT }, animStyle]}>
          {label}
        </Animated.Text>
      )}
    </Pressable>
  );
}

// A plain button grid standing in for the OS numeric keyboard — used
// wherever a field auto-focuses on screen-open (Add Transaction's Amount,
// the OTP code), since that's exactly the case where syncing with a real
// keyboard's own show/hide animation gets janky. A custom keypad has no
// native lifecycle to sync with at all: it just renders as a permanent,
// fixed-height part of the screen's layout from the moment it mounts.
export const NumericKeypad = memo(function NumericKeypad({ onKeyPress, insetBottom, rows = DECIMAL_KEYPAD_ROWS, light = false }) {
  const keyColor = light ? '#111111' : '#ffffff';

  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: insetBottom + 10 }}>
      {rows.map((row, ri) => (
        <View key={ri} className="flex-row" style={{ gap: 0, marginBottom: ri === rows.length - 1 ? 0 : 6 }}>
          {row.map((key, ki) => (
            <KeypadKey key={key ?? `blank-${ki}`} label={key} onPress={key == null ? undefined : () => onKeyPress(key)} color={keyColor} />
          ))}
        </View>
      ))}
    </View>
  );
});
