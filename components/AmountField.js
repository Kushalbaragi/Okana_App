import { useEffect } from 'react';
import { Text } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, LinearTransition } from 'react-native-reanimated';

// Same ease-out-expo "settle" feel used for reveals throughout the app
// (welcome flow, account.js, onboarding).
export const SETTLE_EASING = Easing.bezier(0.16, 1, 0.3, 1);

// Shared by every element in an amount row (₹ symbol included) — the row
// is center-justified, so adding a digit grows its total width and shifts
// *everything* in it left to stay centered, not just the new digit. Giving
// them all the same layout transition is what makes that read as one
// element sliding together instead of the symbol/older digits snapping
// while only the new digit animates.
export const AMOUNT_LAYOUT_TRANSITION = LinearTransition.duration(420).easing(SETTLE_EASING);

// Each newly-typed digit blurs into focus rather than just appearing flat —
// starts slightly enlarged, near-transparent, and genuinely blurred (RN's
// textShadowRadius is a real Gaussian blur on the glyph itself, not a fake),
// then resolves to sharp/full-size/full-opacity. Only the character that
// just appeared plays this — existing digits are stable-keyed by index so
// they never remount/replay it, and it's skipped entirely when the field is
// populated programmatically (opening pre-filled) rather than typed.
export function AmountDigit({ char, animateIn, color = '#ffffff', fontSize = 48, lineHeight = 56 }) {
  // Split from the fade so blur resolves quickly (it's a hint the digit is
  // "arriving", not the main event) while opacity — the actual materialize
  // — takes noticeably longer, reading as a fade-in with a light touch of
  // blur rather than a blur-dominated reveal.
  const fadeProgress = useSharedValue(animateIn ? 0 : 1);
  const blurProgress = useSharedValue(animateIn ? 0 : 1);

  useEffect(() => {
    if (animateIn) {
      fadeProgress.value = withTiming(1, { duration: 640, easing: SETTLE_EASING });
      blurProgress.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: fadeProgress.value,
    transform: [
      { scale: 0.82 + fadeProgress.value * 0.18 },
      { translateY: (1 - fadeProgress.value) * 16 },
    ],
    textShadowRadius: (1 - blurProgress.value) * 6,
  }));

  return (
    <Animated.Text
      layout={AMOUNT_LAYOUT_TRANSITION}
      style={[
        {
          fontSize, lineHeight, fontWeight: '600', color,
          textShadowColor: color, textShadowOffset: { width: 0, height: 0 },
        },
        style,
      ]}
    >
      {char}
    </Animated.Text>
  );
}

// The ₹ symbol + digit row, sharing the same layout transition so the whole
// group slides together as digits are added/removed — or the dimmed "0"
// placeholder when the field is empty. Used anywhere an amount is entered
// via NumericKeypad (Add Transaction, Set Budget).
export function AmountRow({ amount, prevAmountLength, skipDigitAnim, symbolFontSize = 44, digitFontSize = 48, lineHeight = 56, light = false }) {
  const digitColor = light ? '#111111' : '#ffffff';
  return (
    <Animated.View layout={AMOUNT_LAYOUT_TRANSITION} className="flex-row items-center justify-center">
      <Animated.Text
        layout={AMOUNT_LAYOUT_TRANSITION}
        className="font-light"
        style={{ fontSize: symbolFontSize, lineHeight, marginRight: 4, color: light ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)' }}
      >
        ₹
      </Animated.Text>
      {amount ? (
        [...amount].map((char, i) => (
          <AmountDigit
            key={i}
            char={char}
            animateIn={i >= prevAmountLength && !skipDigitAnim}
            fontSize={digitFontSize}
            lineHeight={lineHeight}
            color={digitColor}
          />
        ))
      ) : (
        <Text className="font-semibold" style={{ fontSize: digitFontSize, lineHeight, color: light ? '#cccccc' : '#333333' }}>0</Text>
      )}
    </Animated.View>
  );
}
