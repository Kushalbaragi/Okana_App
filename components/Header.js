import { memo, useEffect, useRef } from 'react';
import { View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { ChevronRight, HamburgerIcon, WalletIcon } from './icons';
import { textColor } from '../utils/colors';

// One pill showing the current view (Expense, Income or Overview); tapping it
// moves to the next, in that fixed order and round again. `mode` is still owned
// by index.js and never persisted.
const MODES = ['expense', 'income', 'overview'];
const MODE_LABELS = { expense: 'Expense', income: 'Income', overview: 'Overview' };

// The pill is a fixed size — wide enough for "OVERVIEW" — so it doesn't grow
// and shrink as the label changes.
const PILL_WIDTH = 108;
const PILL_HEIGHT = 36;
// The label sits a step under the scale's caption size (13): a few uppercase
// letters in a header pill need to be smaller than text in a card.
const LABEL_SIZE = 12;
const LABEL_FADE_MS = 200;

function ModePill({ mode, onSelectMode, light }) {
  const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
  // The new label fades in rather than swapping — skipped on first mount, where
  // there's no old label to fade from.
  const labelOpacity = useSharedValue(1);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    labelOpacity.value = 0;
    labelOpacity.value = withTiming(1, { duration: LABEL_FADE_MS });
  }, [mode, labelOpacity]);
  const labelStyle = useAnimatedStyle(() => ({ opacity: labelOpacity.value }));

  return (
    <Pressable
      onPress={() => onSelectMode(next)}
      accessibilityRole="button"
      accessibilityLabel={`${MODE_LABELS[mode]}. Tap to switch to ${MODE_LABELS[next]}`}
      style={{
        width: PILL_WIDTH,
        height: PILL_HEIGHT,
        borderRadius: PILL_HEIGHT / 2,
        // A soft fill, no border — the same pill the active label used to sit in.
        // Solid, not translucent, so the page background doesn't show through.
        backgroundColor: light ? '#eeeeec' : '#0f0f0f',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Animated.Text
        numberOfLines={1}
        style={[{ fontSize: LABEL_SIZE, fontWeight: '500', letterSpacing: 0.3, textTransform: 'uppercase', color: textColor(light).primary }, labelStyle]}
      >
        {MODE_LABELS[mode]}
      </Animated.Text>
      {/* A small chevron at the right edge: this moves on to the next view. */}
      <View pointerEvents="none" style={{ position: 'absolute', right: 11, top: 0, bottom: 0, justifyContent: 'center' }}>
        <ChevronRight size={9} color={textColor(light).disabled} />
      </View>
    </Pressable>
  );
}

// `light` is a one-off experimental prop for trying a light theme on just
// the Dashboard — not a real app-wide theme system, so it's threaded
// through as a plain prop rather than a context. Every other screen keeps
// passing nothing (defaults to the normal dark look).
function Header({ onMenuOpen, onCalendarOpen, mode, onSelectMode, light = false }) {
  // Safe-area-aware — a fixed pt-6 isn't enough clearance under the status
  // bar / notch / Dynamic Island on real devices (fine in the web preview,
  // which has no such concept, but overlapped the status bar on-device).
  const insets = useSafeAreaInsets();
  const iconColor = light ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.7)';

  return (
    <View className="flex-row items-center justify-between pb-5 px-5" style={{ paddingTop: insets.top + 16 }}>
      <Pressable
        onPress={onMenuOpen}
        className="w-9 h-9 items-center justify-center rounded-xl"
        accessibilityRole="button"
        accessibilityLabel="Open menu"
      >
        <HamburgerIcon color={iconColor} />
      </Pressable>

      {/* Same width on both side buttons (w-9) is what centres this
          perfectly via justify-between, with no absolute positioning
          needed — see the row's own layout math. */}
      <ModePill mode={mode} onSelectMode={onSelectMode} light={light} />

      <Pressable
        onPress={onCalendarOpen}
        className="w-9 h-9 items-center justify-center rounded-xl"
        accessibilityRole="button"
        accessibilityLabel="Open budget and savings"
      >
        <WalletIcon color={iconColor} />
      </Pressable>
    </View>
  );
}

export default memo(Header);
