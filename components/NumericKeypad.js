import { memo, useRef } from 'react';
import { View, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { useAudioPlayer } from 'expo-audio';

// A single shared player retriggered via seekTo(0)+play() drops sounds when
// keys come in fast (backspace held, or quick digit runs) — seekTo is
// async, and firing it again on a player that's still mid-playback from
// the previous press races with that pending seek, so some presses
// silently produce nothing. A small round-robin pool sidesteps the race
// entirely: each press gets its own independent player instance instead of
// interrupting whatever the last one is still doing.
const POOL_SIZE = 3;

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

// Canonical "what does this key do to an amount string" rule — shared by
// every caller that feeds NumericKeypad amount digits (Add Transaction,
// Budget setup), so the digit-entry rules and the "did this actually
// change anything" check the click sound is gated on can't drift apart.
export function nextAmountValue(prev, key) {
  if (key === 'backspace') return prev.slice(0, -1);
  if (key === '.') {
    if (prev.includes('.')) return prev;
    return prev === '' ? '0.' : `${prev}.`;
  }
  if (prev === '0') return key;
  const decimals = prev.split('.')[1];
  if (decimals != null && decimals.length >= 2) return prev; // max 2 decimal places
  if (prev.replace('.', '').length >= 9) return prev; // sane upper bound
  return prev + key;
}

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
export const NumericKeypad = memo(function NumericKeypad({ onKeyPress, insetBottom, rows = DECIMAL_KEYPAD_ROWS }) {
  // Fixed-size pools (see POOL_SIZE comment above) — a fixed number of
  // hook calls per render, same as any other array of hooks.
  const clickPlayers = [
    useAudioPlayer(CLICK_SOUND), useAudioPlayer(CLICK_SOUND), useAudioPlayer(CLICK_SOUND),
  ];
  const clearPlayers = [
    useAudioPlayer(CLEAR_SOUND), useAudioPlayer(CLEAR_SOUND), useAudioPlayer(CLEAR_SOUND),
  ];
  const clickIndexRef = useRef(0);
  const clearIndexRef = useRef(0);

  function handlePress(key) {
    // onKeyPress reports back whether the press actually changed anything
    // (e.g. a rejected key at the digit/decimal limit, or backspace on an
    // empty field) — no change, no sound. Callers that don't return
    // anything (e.g. plain digit-only screens with no such limit) get
    // `undefined`, which still plays — only an explicit `false` mutes it.
    const changed = onKeyPress(key);
    if (changed === false) return;

    const pool = key === 'backspace' ? clearPlayers : clickPlayers;
    const indexRef = key === 'backspace' ? clearIndexRef : clickIndexRef;
    const player = pool[indexRef.current];
    indexRef.current = (indexRef.current + 1) % pool.length;
    player.seekTo(0);
    player.play();
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
});
