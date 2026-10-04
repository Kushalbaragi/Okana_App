import { useEffect, useState } from 'react';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring, withDelay, Easing } from 'react-native-reanimated';
import { SETTLE_EASING, SPRING_QUICK, layoutTransition } from '../utils/motion';
import { TABULAR } from '../utils/type';

// Same ease-out-expo "settle" feel used for reveals throughout the app
// (welcome flow, account.js, onboarding).

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
// series of small shifts.
//
// A dedicated spring, not the shared SPRING_QUICK preset (used elsewhere
// for an identical "sliding pill" motion — Header's chart-tab toggle) —
// SPRING_QUICK's own settle time ran measurably longer than this row's
// digit fades (ENTER_DURATION/EXIT_DURATION below), so the two were
// visibly out of step: typing a digit, the older digits were still
// mid-shift after the new one had already fully faded in; backspacing,
// the remaining digits finished sliding into the gap while the removed
// one was still visibly fading out. Quicker (higher stiffness, same
// damping *ratio* so it's still no-overshoot) brings the shift's own
// settle time back in line with both.
//
// Stiffer again on top of that first pass — a first tuning fixed it for
// ordinary typing speed, but fast typing re-triggers this same spring
// (every keystroke shifts every digit again) faster than it can settle:
// each retrigger carries forward whatever position/velocity it already
// had rather than resetting (that's *why* it's a spring, not a duration —
// see above), but a still-settling-from-the-last-keystroke spring is
// still visibly behind when the digit it belongs with has already
// finished its own fixed-duration fade in, and it never gets the chance
// to catch up before the next keystroke moves its target again. Stiff
// enough to settle well inside a fast typing cadence (well under
// ENTER_DURATION) is what actually closes that gap, rather than just
// narrowing it for the average case.
const AMOUNT_SHIFT_SPRING = { damping: 24, stiffness: 500, mass: 0.35 };
const AMOUNT_LAYOUT_TRANSITION = layoutTransition(AMOUNT_SHIFT_SPRING);

const ENTER_DURATION = 220;
const EXIT_DURATION = 180;
const BLUR_MAX = 6;
const ENTER_RISE = 12;

// Mirrors the entrance in reverse: fades out, shrinks, and drifts *up*
// and away (entrance comes from below) — instead of a typed-over digit
// just vanishing outright when backspaced. Reanimated's `exiting` prop
// keeps the outgoing character mounted just long enough to actually play
// this before removing it from the tree. No blur on the way out —
// textShadowRadius isn't a supported layout-animation prop (Reanimated
// warns and may not apply it), unlike the entrance, which animates it
// through useAnimatedStyle.
//
// Easing.out, not .in — an ease-in stays close to fully visible for most
// of EXIT_DURATION and only actually fades in its last stretch, which
// meant the remaining digits (sliding into the gap on AMOUNT_SHIFT_SPRING,
// a spring — see AMOUNT_LAYOUT_TRANSITION above) had already arrived at
// their new position well before this one had visibly gone, reading as an
// overlap. Front-loading the fade instead means it's mostly gone early,
// around the same time the shift is doing most of its own moving.
function digitExiting() {
  'worklet';
  return {
    initialValues: {
      opacity: 1,
      transform: [{ scale: 1 }, { translateY: 0 }],
    },
    animations: {
      opacity: withTiming(0, { duration: EXIT_DURATION, easing: Easing.out(Easing.cubic) }),
      transform: [
        { scale: withTiming(0.75, { duration: EXIT_DURATION, easing: Easing.out(Easing.cubic) }) },
        { translateY: withTiming(-8, { duration: EXIT_DURATION, easing: Easing.out(Easing.cubic) }) },
      ],
    },
  };
}

// Each newly-typed digit blurs into focus rather than just appearing flat —
// starts slightly enlarged, near-transparent, and softly glowing (a
// textShadowRadius halo standing in for a real blur — RN's Text has no
// actual pixel-blur filter), rising up from below as it fades in, then
// resolves to sharp/full-size/full-opacity. Only the character that just
// appeared plays this —
// existing digits are stable-keyed by index so they never remount/replay
// it, and it's skipped entirely when the field is populated
// programmatically (opening pre-filled) rather than typed. Backspacing a
// digit plays a fade/shrink/rise-away via `exiting` above.
// `delay` is optional (default 0, matching every existing caller's
// immediate-on-keystroke behavior) — used by SummaryCard's headline to
// stagger a fresh set of digits in left-to-right instead of all at once.
// `instantExit` skips the scale/rise-away exit entirely (an outgoing
// digit just disappears immediately) — SummaryCard's headline wants the
// *old* value gone at once so the *new* one's own entrance can start right
// away, rather than waiting out a whole exit animation on a value the user
// already moved on from.
function AmountDigit({ char, animateIn, color = '#ffffff', fontSize = 48, lineHeight = 56, fontWeight = '600', letterSpacing, delay = 0, instantExit = false, layoutReady = true }) {
  const fadeProgress = useSharedValue(animateIn ? 0 : 1);

  useEffect(() => {
    if (animateIn) {
      fadeProgress.value = withDelay(delay, withTiming(1, { duration: ENTER_DURATION, easing: SETTLE_EASING }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => {
    // Blur is 100% at the very start and fully resolved (0%) by 75% of
    // the way through — not tied to its own separate timer, derived
    // straight from the same progress driving fade/scale, so it's always
    // exactly "gone by three-quarters" regardless of duration tuning.
    // Smoothstepped (not linear) so it tapers off gradually at both ends
    // instead of dissolving at a constant rate then hard-stopping at 0.
    const linearBlurT = Math.min(fadeProgress.value / 0.75, 1);
    const blurT = linearBlurT * linearBlurT * (3 - 2 * linearBlurT);
    return {
      opacity: fadeProgress.value,
      transform: [
        { scale: 0.8 + fadeProgress.value * 0.2 },
        { translateY: (1 - fadeProgress.value) * ENTER_RISE },
      ],
      textShadowRadius: (1 - blurT) * BLUR_MAX,
    };
  });

  return (
    <Animated.Text
      layout={layoutReady ? AMOUNT_LAYOUT_TRANSITION : undefined}
      exiting={instantExit ? undefined : digitExiting}
      style={[
        {
          fontSize, lineHeight, fontWeight, color, letterSpacing, ...TABULAR,
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
function ZeroPlaceholder({ fontSize, lineHeight, fontWeight, color, letterSpacing, delayed }) {
  const opacity = useSharedValue(delayed ? 0 : 1);

  useEffect(() => {
    if (delayed) {
      opacity.value = withDelay(EXIT_DURATION, withTiming(1, { duration: ENTER_DURATION * 0.6, easing: SETTLE_EASING }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.Text style={[{ fontSize, lineHeight, fontWeight, color, letterSpacing, ...TABULAR }, style]}>
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

// `autoShrink` (default true) is the "past 4 digits, shrink toward
// MIN_SCALE" behavior described below — left on for every existing
// caller. A caller with genuine spare room around the field (Add
// Transaction's own sheet, once its digits stopped needing to share space
// with anything crowding them) can opt out entirely and keep the amount
// at a single constant size regardless of how many digits are typed.
export function AmountRow({ amount, prevAmountLength, skipDigitAnim, digitFontSize = 48, lineHeight = 56, light = false, zeroColor, weight = '600', letterSpacing, autoShrink = true }) {
  // The row's `layout` transition (AMOUNT_LAYOUT_TRANSITION) is meant for
  // keystroke-driven re-centering, not the very first layout pass — a
  // modal that slides/resizes into place (Add Transaction's own sheet
  // open) can settle this row into its real width a beat after mount,
  // and with the transition live from the start that settle plays as a
  // spring slide, reading as the amount field animating in on its own
  // instead of just sitting fixed while the sheet moves. Holding the
  // transition off until one render after mount lets that first settle
  // happen instantly, with no prior layout for Reanimated to animate from.
  const [layoutReady, setLayoutReady] = useState(false);
  useEffect(() => { setLayoutReady(true); }, []);

  const digitColor = zeroColor ?? (light ? '#111111' : '#ffffff');
  const emptyColor = zeroColor ?? (light ? '#cccccc' : '#333333');
  const fontWeight = weight;
  const symbolColor = amount ? digitColor : emptyColor;
  const symbolFontSize = digitFontSize * 0.65;

  const rawDigitCount = amount ? amount.replace('.', '').length : 0;
  const span = SCALE_END_DIGITS - SCALE_START_DIGITS;
  const targetScale = !autoShrink || rawDigitCount <= SCALE_START_DIGITS
    ? 1
    : Math.max(MIN_SCALE, 1 - (Math.min(rawDigitCount, SCALE_END_DIGITS) - SCALE_START_DIGITS) * ((1 - MIN_SCALE) / span));

  // Spring, not duration+easing — this retriggers on every keystroke (a
  // digit added or removed), same as AMOUNT_LAYOUT_TRANSITION above, and
  // for the same reason: a fixed-duration curve resets to zero velocity on
  // each restart, which read as a hard, stepped shrink rather than one
  // continuous scale-down. A spring picks up from whatever speed it's
  // already moving at instead.
  const scale = useSharedValue(targetScale);
  useEffect(() => {
    scale.value = withSpring(targetScale, SPRING_QUICK);
  }, [targetScale, scale]);
  const scaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View layout={layoutReady ? AMOUNT_LAYOUT_TRANSITION : undefined} style={scaleStyle} className="flex-row items-center justify-center">
      <Animated.Text
        layout={layoutReady ? AMOUNT_LAYOUT_TRANSITION : undefined}
        style={{ fontSize: symbolFontSize, lineHeight, fontWeight: '400', marginRight: 4, color: symbolColor, opacity: 0.7, ...TABULAR }}
      >
        ₹
      </Animated.Text>
      {amount ? (
        [...amount].map((char, i) => (
          <AmountDigit
            key={i}
            char={char}
            animateIn={i >= prevAmountLength && !skipDigitAnim}
            instantExit={skipDigitAnim}
            fontSize={digitFontSize}
            lineHeight={lineHeight}
            color={digitColor}
            fontWeight={fontWeight}
            letterSpacing={letterSpacing}
            layoutReady={layoutReady}
          />
        ))
      ) : (
        <ZeroPlaceholder
          fontSize={digitFontSize}
          lineHeight={lineHeight}
          fontWeight={fontWeight}
          letterSpacing={letterSpacing}
          color={emptyColor}
          delayed={prevAmountLength > 0 && !skipDigitAnim}
        />
      )}
    </Animated.View>
  );
}
