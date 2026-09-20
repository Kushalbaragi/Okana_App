import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { SETTLE_EASING } from './AmountField';
import { formatCurrency, formatCurrencyFull } from '../utils/format';
import { CARD_RADIUS, SMOOTH } from './Glass';

// Small pieces shared by the savings list and its goal cards.

// 'ui-rounded' for the numerals, as everywhere else the amounts are shown —
// see AmountField.js.
export const ROUNDED_FONT = Platform.OS === 'ios' ? 'ui-rounded' : undefined;

const CARD_COLOR = '#151515';
const FILL_COLOR = '#4ade80';
export const POSITIVE = 'rgba(74,222,128,0.85)';

export const money = (n) => (Number.isInteger(n) ? formatCurrency(n) : formatCurrencyFull(n));

export const dim = (light, a = 0.4) => (light ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`);

// Solid rounded bar. Fills toward its value whenever it changes, and on first
// mount — the width is a percentage string on the UI thread, so no layout
// measuring is needed.
export function ProgressBar({ percent, height = 6, light }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(percent / 100, { duration: 420, easing: SETTLE_EASING });
  }, [percent, progress]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <View style={{ height, borderRadius: height / 2, overflow: 'hidden', backgroundColor: dim(light, 0.08) }}>
      <Animated.View style={[{ height: '100%', borderRadius: height / 2, backgroundColor: FILL_COLOR }, fillStyle]} />
    </View>
  );
}

// The fill of a Card. A row that slides aside (swipe to delete) has to paint this
// itself, or the button underneath shows through it.
export const cardFill = (light) => (light ? '#FFFFFF' : CARD_COLOR);

export function Card({ children, light }) {
  return (
    <View style={{ backgroundColor: cardFill(light), borderRadius: CARD_RADIUS, ...SMOOTH, overflow: 'hidden' }}>
      {children}
    </View>
  );
}
