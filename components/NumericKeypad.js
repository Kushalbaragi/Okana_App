import { View, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';

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

// Flat, no per-key box — just the digit sitting on the page background.
// Feedback on tap comes from a Reanimated scale+dim on the label itself
// (driven via onPressIn/onPressOut, not the Pressable's own style prop — a
// function-style prop on Pressable doesn't reliably apply in this
// NativeWind setup, same issue GlassPressable works around).
function KeypadKey({ label, onPress }) {
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

// A plain button grid standing in for the OS numeric keyboard — used
// wherever a field auto-focuses on screen-open (Add Transaction's Amount,
// the OTP code), since that's exactly the case where syncing with a real
// keyboard's own show/hide animation gets janky. A custom keypad has no
// native lifecycle to sync with at all: it just renders as a permanent,
// fixed-height part of the screen's layout from the moment it mounts.
export function NumericKeypad({ onKeyPress, insetBottom, rows = DECIMAL_KEYPAD_ROWS }) {
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: insetBottom + 10 }}>
      {rows.map((row, ri) => (
        <View key={ri} className="flex-row" style={{ gap: 0, marginBottom: ri === rows.length - 1 ? 0 : 6 }}>
          {row.map((key, ki) => (
            <KeypadKey key={key ?? `blank-${ki}`} label={key} onPress={key == null ? undefined : () => onKeyPress(key)} />
          ))}
        </View>
      ))}
    </View>
  );
}
