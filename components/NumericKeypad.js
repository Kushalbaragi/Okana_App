import { View, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { useAudioPlayer } from 'expo-audio';

// Two minimal, pitch-paired tones — entering (higher) and clearing/
// backspace (lower) — so they read as the same sound family rather than
// two unrelated effects.
const CLICK_SOUND = require('../assets/sounds/key_click.wav');
const CLEAR_SOUND = require('../assets/sounds/key_clear.wav');

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
  // One shared player per tone rather than one per key — keys are tapped
  // in quick succession, and seekTo(0)+play() restarts from the top each
  // time, same as a real keyboard's click sound retriggering.
  const clickPlayer = useAudioPlayer(CLICK_SOUND);
  const clearPlayer = useAudioPlayer(CLEAR_SOUND);

  function handlePress(key) {
    const player = key === 'backspace' ? clearPlayer : clickPlayer;
    player.seekTo(0);
    player.play();
    onKeyPress(key);
  }

  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: insetBottom + 10 }}>
      {rows.map((row, ri) => (
        <View key={ri} className="flex-row" style={{ gap: 0, marginBottom: ri === rows.length - 1 ? 0 : 6 }}>
          {row.map((key, ki) => (
            <KeypadKey key={key ?? `blank-${ki}`} label={key} onPress={key == null ? undefined : () => handlePress(key)} />
          ))}
        </View>
      ))}
    </View>
  );
}
