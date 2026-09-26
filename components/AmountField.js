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
// series of small shifts. Same physics already proven smooth elsewhere in
// this app for an identical "sliding pill" motion — Header's chart-tab
// toggle. SPRING_QUICK — the same preset SegmentedSwitch's pill uses.
export const AMOUNT_LAYOUT_TRANSITION = layoutTransition(SPRING_QUICK);

const ENTER_DURATION = 400;
const EXIT_DURATION = 320;
// Lower than it looks like it should be — textShadowRadius is a shadow/glow
// around the glyph's outline, not a true blur of its pixels, so a large
// radius reads as a harsh bright halo rather than something soft/defocused.
// Keeping it small is what makes it pass as "soft" instead of "glowing".
const BLUR_MAX = 14;
// How far below its resting spot a digit starts before rising in — 16px
// reads as barely-there next to a 72px digit, so this is bumped up to
// actually register as "rising from below" rather than popping in place.
const ENTER_RISE = 26;

// Mirrors the entrance in reverse: fades out, shrinks, and drifts *up*
// and away (entrance comes from below) — instead of a typed-over digit
// just vanishing outright when backspaced. Reanimated's `exiting` prop
// keeps the outgoing character mounted just long enough to actually play
// this before removing it from the tree. No blur on the way out —
// textShadowRadius isn't a supported layout-animation prop (Reanimated
// warns and may not apply it), unlike the entrance, which animates it
// through useAnimatedStyle.
function digitExiting() {
  'worklet';
  return {
    initialValues: {
      opacity: 1,
      transform: [{ scale: 1 }, { translateY: 0 }],
    },
    animations: {
      opacity: withTiming(0, { duration: EXIT_DURATION, easing: Easing.in(Easing.cubic) }),
      transform: [
        { scale: withTiming(0.5, { duration: EXIT_DURATION, easing: Easing.in(Easing.cubic) }) },
        { translateY: withTiming(-16, { duration: EXIT_DURATION, easing: Easing.in(Easing.cubic) }) },
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
export function AmountDigit({ char, animateIn, color = '#ffffff', fontSize = 48, lineHeight = 56, fontWeight = '600', letterSpacing, delay = 0, instantExit = false, layoutReady = true }) {
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
        { scale: 0.5 + fadeProgress.value * 0.5 },
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
    <Animated.Text style={[{ fontSize, lineHeight, fontWeight, color, ...TABULAR }, style]}>
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

export function AmountRow({ amount, prevAmountLength, skipDigitAnim, digitFontSize = 48, lineHeight = 56, light = false, zeroColor, weight = '600' }) {
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
  const targetScale = rawDigitCount <= SCALE_START_DIGITS
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
            fontSize={digitFontSize}
            lineHeight={lineHeight}
            color={digitColor}
            fontWeight={fontWeight}
            layoutReady={layoutReady}
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
