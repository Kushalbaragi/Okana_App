import { useEffect } from 'react';
import { Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing, LinearTransition } from 'react-native-reanimated';

// SF Pro Rounded — a system font on iOS, so no bundling/download needed,
// but only iOS actually has it; Android has no equivalent rounded design
// and just falls back to its own default (Roboto) when this doesn't
// resolve to anything. Scoped to the amount digits only, not the app's
// typeface in general.
const ROUNDED_FONT = Platform.OS === 'ios' ? 'SF Pro Rounded' : undefined;

// Same ease-out-expo "settle" feel used for reveals throughout the app
// (welcome flow, account.js, onboarding).
export const SETTLE_EASING = Easing.bezier(0.16, 1, 0.3, 1);

// Shared by every element in an amount row (₹ symbol included) — the row
// is center-justified, so adding a digit grows its total width and shifts
// *everything* in it left to stay centered, not just the new digit. Giving
// them all the same layout transition is what makes that read as one
// element sliding together instead of the symbol/older digits snapping
// while only the new digit animates.
//
// Spring-based, not duration+easing — a fixed-duration curve retriggered
// on every keystroke (this fires on every single one) can read as a
// slight "step" each time it restarts, since it has no notion of the
// velocity it was already moving at. A spring naturally continues from
// wherever it currently is with matching momentum instead of resetting,
// which is what actually reads as one continuous slide rather than a
// series of small shifts. Same physics already proven smooth elsewhere in
// this app for an identical "sliding pill" motion — Header's chart-tab
// toggle.
export const AMOUNT_LAYOUT_TRANSITION = LinearTransition.springify().damping(18).stiffness(220).mass(0.5);

const ENTER_DURATION = 400;
const EXIT_DURATION = 320;
const BLUR_MAX = 30;
// How far below its resting spot a digit starts before rising in — 16px
// reads as barely-there next to a 72px digit, so this is bumped up to
// actually register as "rising from below" rather than popping in place.
const ENTER_RISE = 26;

// Mirrors the entrance in reverse: fades out, re-blurs, and drifts *up*
// and away (entrance comes from below) — instead of a typed-over digit
// just vanishing outright when backspaced. Reanimated's `exiting` prop
// keeps the outgoing character mounted just long enough to actually play
// this before removing it from the tree.
function digitExiting() {
  'worklet';
  return {
    initialValues: {
      opacity: 1,
      transform: [{ scale: 1 }, { translateY: 0 }],
      textShadowRadius: 0,
    },
    animations: {
      opacity: withTiming(0, { duration: EXIT_DURATION, easing: Easing.in(Easing.cubic) }),
      transform: [
        { scale: withTiming(0.5, { duration: EXIT_DURATION, easing: Easing.in(Easing.cubic) }) },
        { translateY: withTiming(-16, { duration: EXIT_DURATION, easing: Easing.in(Easing.cubic) }) },
      ],
      textShadowRadius: withTiming(BLUR_MAX, { duration: EXIT_DURATION * 0.75 }),
    },
  };
}

// Each newly-typed digit blurs into focus rather than just appearing flat —
// starts slightly enlarged, near-transparent, and genuinely blurred (RN's
// textShadowRadius is a real Gaussian blur on the glyph itself, not a fake),
// rising up from below as it fades in, then resolves to sharp/full-size/
// full-opacity. Only the character that just appeared plays this —
// existing digits are stable-keyed by index so they never remount/replay
// it, and it's skipped entirely when the field is populated
// programmatically (opening pre-filled) rather than typed. Backspacing a
// digit plays the same effect in reverse via `exiting` above.
export function AmountDigit({ char, animateIn, color = '#ffffff', fontSize = 48, lineHeight = 56, fontWeight = '600' }) {
  const fadeProgress = useSharedValue(animateIn ? 0 : 1);

  useEffect(() => {
    if (animateIn) {
      fadeProgress.value = withTiming(1, { duration: ENTER_DURATION, easing: SETTLE_EASING });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => {
    // Blur is 100% at the very start and fully resolved (0%) by 75% of
    // the way through — not tied to its own separate timer, derived
    // straight from the same progress driving fade/scale, so it's always
    // exactly "gone by three-quarters" regardless of duration tuning.
    const blurT = Math.min(fadeProgress.value / 0.75, 1);
    return {
      opacity: fadeProgress.value,
      transform: [
        { scale: 0.5 + fadeProgress.value * 0.5 },
        { translateY: (1 - fadeProgress.value) * ENTER_RISE },
      ],
      textShadowRadius: (1 - blurT) * BLUR_MAX,
    };
  });

  return (
    <Animated.Text
      layout={AMOUNT_LAYOUT_TRANSITION}
      exiting={digitExiting}
      style={[
        {
          fontSize, lineHeight, fontWeight, color, fontFamily: ROUNDED_FONT,
          textShadowColor: color, textShadowOffset: { width: 0, height: 0 },
        },
        style,
      ]}
    >
      {char}
    </Animated.Text>
  );
}

// The dim "0" shown once the field is fully cleared. When that clearing
// just happened (a real last digit was backspaced away), this holds off
// appearing until that digit's own exiting animation has actually finished
// — otherwise it mounts instantly in the same spot the outgoing digit is
// still fading out of, reading as an overlap instead of one clean
// replacing the other. On first mount with nothing ever typed, there's no
// digit to wait on, so it just shows immediately.
function ZeroPlaceholder({ fontSize, lineHeight, fontWeight, color, delayed }) {
  const opacity = useSharedValue(delayed ? 0 : 1);

  useEffect(() => {
    if (delayed) {
      opacity.value = withDelay(EXIT_DURATION, withTiming(1, { duration: ENTER_DURATION * 0.6, easing: SETTLE_EASING }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.Text style={[{ fontSize, lineHeight, fontWeight, color, fontFamily: ROUNDED_FONT }, style]}>
      0
    </Animated.Text>
  );
}

// The ₹ symbol + digit row, sharing the same layout transition so the whole
// group slides together as digits are added/removed — or the dimmed "0"
// placeholder when the field is empty. Used anywhere an amount is entered
// via NumericKeypad (Add Transaction, Set Budget).
//
// `zeroColor`/`weight` are optional overrides — left undefined, everything
// behaves exactly as before (dim "0" placeholder, full-bright typed digits,
// 600-weight), so Budget setup's own call site is unaffected by a caller
// (Add Transaction) opting into a different color/weight. `zeroColor`
// doubles as the typed-digit color too when given, since both are "the
// amount's own color" as far as a caller adjusting brightness cares.
//
// The ₹ symbol is smaller than the digits (not matched to them) — the
// number is the dominant element, the symbol just identifies the unit.
// Lighter weight and dimmer too (opacity, not a separate color, so it
// dims whatever color the caller passed in without needing to parse it).
//
// Past 4 digits, the whole row scales down gradually (not a hard step) as
// more are typed, reaching MIN_SCALE at the 8-digit entry cap — and scales
// back up the same way on backspace, since it's just a function of the
// current digit count, recomputed fresh every render. Driven through an
// animated `transform: scale` on the row rather than changing the actual
// `fontSize` number — a font size change can't be smoothly interpolated
// by the renderer (text just re-lays-out at the new size instantly), but
// a transform scale animates like any other Reanimated value.
const SCALE_START_DIGITS = 4;
const SCALE_END_DIGITS = 8; // matches nextAmountValue's entry cap
const MIN_SCALE = 0.65;
const SCALE_DURATION = 220;

export function AmountRow({ amount, prevAmountLength, skipDigitAnim, digitFontSize = 48, lineHeight = 56, light = false, zeroColor, weight = '600' }) {
  const digitColor = zeroColor ?? (light ? '#111111' : '#ffffff');
  const emptyColor = zeroColor ?? (light ? '#cccccc' : '#333333');
  const fontWeight = weight;
  const symbolColor = amount ? digitColor : emptyColor;
  const symbolFontSize = digitFontSize * 0.65;

  const rawDigitCount = amount ? amount.replace('.', '').length : 0;
  const span = SCALE_END_DIGITS - SCALE_START_DIGITS;
  const targetScale = rawDigitCount <= SCALE_START_DIGITS
    ? 1
    : Math.max(MIN_SCALE, 1 - (Math.min(rawDigitCount, SCALE_END_DIGITS) - SCALE_START_DIGITS) * ((1 - MIN_SCALE) / span));

  const scale = useSharedValue(targetScale);
  useEffect(() => {
    scale.value = withTiming(targetScale, { duration: SCALE_DURATION, easing: SETTLE_EASING });
  }, [targetScale, scale]);
  const scaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View layout={AMOUNT_LAYOUT_TRANSITION} style={scaleStyle} className="flex-row items-center justify-center">
      <Animated.Text
        layout={AMOUNT_LAYOUT_TRANSITION}
        style={{ fontSize: symbolFontSize, lineHeight, fontWeight: '400', marginRight: 4, color: symbolColor, opacity: 0.7, fontFamily: ROUNDED_FONT }}
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
            fontWeight={fontWeight}
          />
        ))
      ) : (
        <ZeroPlaceholder
          fontSize={digitFontSize}
          lineHeight={lineHeight}
          fontWeight={fontWeight}
          color={emptyColor}
          delayed={prevAmountLength > 0 && !skipDigitAnim}
        />
      )}
    </Animated.View>
  );
}
