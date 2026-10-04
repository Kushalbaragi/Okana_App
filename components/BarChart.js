import { memo, useEffect, useRef, Fragment } from 'react';
import Svg, { Line, Rect, Circle, Path, Text as SvgText } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedProps, withDelay, withTiming, Easing } from 'react-native-reanimated';
import { textColor, EXPENSE, EXPENSE_DIM, INCOME, INCOME_DIM } from '../utils/colors';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// The two bar colours; isIncome picks which one a chart uses. See the data
// colour block in utils/colors.js for what they mean and why these two are
// the only colours in the app.
const GREEN_TONE = { active: INCOME, dim: INCOME_DIM };
const RED_TONE   = { active: EXPENSE, dim: EXPENSE_DIM };

const BAR_HEIGHT = 110;
const CHART_W    = 264;
// The chart's box is always this shape (width / height) — SummaryCard reserves
// the same box for the Overview line chart so the page doesn't shift between tabs.
export const BAR_CHART_ASPECT = CHART_W / (BAR_HEIGHT + 22);
// Fixed edge inset for the bar row, independent of how many bars there are.
// Centering each bar within an equal GROUP_W slot (the old approach) left a
// margin that grew with the slot size whenever there were few bars — e.g.
// only 4-6 for an "All Time" yearly view — since BAR_W is capped well below
// a wide slot. A small fixed inset plus evenly-spaced bar edges keeps that
// margin the same regardless of bar count, so the chart lines up with the
// cards around it instead of framing itself in whitespace on wide slots.
const CHART_EDGE_PAD = 6;
// A flat per-bar step (capped, not spread proportionally across a fixed
// total budget) — spreading a fixed budget across the bar count shrinks the
// gap between consecutive bars as there are more of them (e.g. 120ms over
// 12 bars is ~11ms apart, barely perceptible as anything but "all at once").
// A flat step keeps the same visible gap between the first several bars
// regardless of how many are on screen; the cap just stops a many-bar view
// (like "All Time") from taking forever for the *later* ones to start.
const BAR_STAGGER_STEP_MS = 55;
const BAR_STAGGER_CAP_MS  = 450;

function Bar({ x, width, rx, targetHeight, delay, fill, maskColor, instant = false }) {
  // Animates the actual pixel height directly (not a 0-1 progress scaled by
  // targetHeight). Always grows from 0 — every period switch mounts a
  // genuinely fresh Bar instance (see the key in the render loop below),
  // so useSharedValue(0)'s own initial value is what gives the grow-in,
  // with no explicit reset step needed here. A same-period value update
  // (e.g. a live transaction landing) reuses the same instance instead, so
  // that case still tweens smoothly from whatever height it's currently at
  // rather than collapsing to 0 — see the two branches below.
  //
  // Tried letting every switch reuse the same instance and just tween
  // straight to the new height, same as the same-period case — faster in
  // theory, but with several bars moving to different new heights at once
  // (some up, some down) it read as the bars "dancing" rather than a clean
  // reveal. A uniform grow-from-0 is calmer to watch even though more
  // pixels are moving.
  //
  // `instant` skips that grow-in entirely — used for a Month/Year/All swipe
  // (see BarChart's own comment), where the bars are still a genuinely
  // fresh instance (a different range has different x positions/bar count,
  // so reusing the old instances would jump sideways instead) but shouldn't
  // replay the reveal every single time someone pages through ranges. It
  // only affects this bar's own entrance — a later value update on the same
  // instance (a live transaction, a data refresh) always tweens normally.
  const animatedHeight = useSharedValue(instant ? targetHeight : 0);
  // Only the reveal — a genuinely fresh instance, i.e. a real period switch
  // (see the animKey in the render loop's key below) — waits out the
  // stagger, on a fast exp curve. Everything after that on the same
  // instance is a value update, not a reveal: useTransactions loads in two
  // waves (AsyncStorage cache, then the Supabase fetch), and a live add
  // lands the same way. Those tween straight to the new height with no
  // delay. Re-applying the stagger to them restarts the whole per-index
  // wait (up to 450ms) from scratch, and withDelay cancels whatever is
  // still mid-flight — so the bar freezes in place for that wait before
  // resuming. Imperceptible on the early near-zero-delay bars; a visible
  // hitch on everything past roughly index 8, and only when the two waves
  // actually differ, which is what made it look intermittent.
  const hasRevealedRef = useRef(instant);

  useEffect(() => {
    if (!hasRevealedRef.current) {
      hasRevealedRef.current = true;
      // cubic, NOT exp. Easing.out(exp) is ~69% done 50ms in and ~90% at
      // 100ms, so against the 55ms stagger every bar snaps to near-full
      // before its neighbour has started — a row of discrete pops rather
      // than a reveal. cubic is only ~47% at 50ms, so roughly five bars are
      // visibly growing at once and it reads as one wave.
      animatedHeight.value = withDelay(delay, withTiming(targetHeight, { duration: 260, easing: Easing.out(Easing.cubic) }));
    } else {
      animatedHeight.value = withTiming(targetHeight, { duration: 260, easing: Easing.out(Easing.cubic) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetHeight]);

  // Tried anchoring a scaleY transform at the baseline via react-native-svg's
  // `origin` prop (to avoid animating layout props every frame) — on native
  // it didn't anchor where expected, so bars grew from a fixed top edge
  // downward instead of from the baseline upward. Animating the path's own
  // d string is the reliable way to get "grows from the bottom" here.
  //
  // A Path rather than a Rect because only the TOP corners are rounded: the
  // bar sits ON the baseline, so rounding its bottom left a sliver of gap
  // under each one and made them read as floating. SVG's Rect takes a
  // single rx for all four corners and has no way to express that, so the
  // shape is drawn by hand — up the left edge, an arc across each top
  // corner, back down the right, and a straight close along the baseline.
  const animatedProps = useAnimatedProps(() => {
    const h = animatedHeight.value;
    const y = BAR_HEIGHT - h;
    // A corner can never be deeper than half the bar itself, or the two top
    // arcs overlap and the shape turns inside out while it's still short —
    // very visible during the grow-in, when every bar passes through that.
    const r = Math.min(rx, width / 2, h / 2);
    const right = x + width;
    return {
      d: `M${x} ${BAR_HEIGHT}`
        + `L${x} ${y + r}`
        + `Q${x} ${y} ${x + r} ${y}`
        + `L${right - r} ${y}`
        + `Q${right} ${y} ${right} ${y + r}`
        + `L${right} ${BAR_HEIGHT}`
        + `Z`,
    };
  });

  // Two stacked paths, not one: `fill` is semi-transparent (the dim/active
  // distinction), so on its own it lets whatever's drawn behind it —
  // namely the average line — show through instead of being covered. The
  // first path is an opaque, background-colored mask in the exact same
  // shape, painted first so it actually blocks the line; the real
  // (semi-transparent) colored path draws on top of that for the intended
  // look, identical to before everywhere the mask has nothing to hide.
  return (
    <Fragment>
      <AnimatedPath fill={maskColor} animatedProps={animatedProps} />
      <AnimatedPath fill={fill} animatedProps={animatedProps} />
    </Fragment>
  );
}

// Fades in on the same stagger schedule as the Bar it stands in for, and
// the same "no special-casing" reasoning as Bar above — see its comment.
// `instant` mirrors Bar's own: skips the fade-in for a range swipe.
function NoSpendDot({ cx, cy, r, fill, delay, instant = false }) {
  const opacity = useSharedValue(instant ? 1 : 0);

  useEffect(() => {
    if (instant) return;
    opacity.value = withDelay(delay, withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedProps = useAnimatedProps(() => ({ opacity: opacity.value }));

  return <AnimatedCircle cx={cx} cy={cy} r={r} fill={fill} animatedProps={animatedProps} />;
}

// Separate from `disabledAfterIndex` — that one also covers "hasn't
// happened yet but is still a real calendar day/month" (e.g. day 17 later
// this month), where the label should stay visible even though the bar
// itself is inert. This one is only for slots that were padded in purely
// to fill out the chart width (see getLifetimeYearly's MIN_YEAR_SLOTS) and
// don't correspond to a real period at all — those keep their empty slot's
// spacing but lose the label, since a label there isn't "a day that hasn't
// happened yet," it's not a period the account will ever have.
// `values` can be signed now — the home chart plots net (income minus
// expense) per period rather than one type at a time, so a bar's own sign
// decides its colour: green for a period that came out ahead, red for one
// that didn't. `isIncome` still matters for a caller passing only
// non-negative magnitudes (the recap's charts, which are always one type) —
// there every value's sign is trivially >= 0, so this reduces to exactly
// the old single-hue behaviour.
function toneFor(v, isIncome) {
  return v < 0 ? RED_TONE : (isIncome ? GREEN_TONE : RED_TONE);
}

function BarChart({ values, labels, activeIndex, accentIndex = null, disabledAfterIndex, disabledBeforeIndex, hideLabelAfterIndex, isIncome, animKey, labelStep = 1, useSqrtScale = false, light = false, noSpendDots = false, instant = false }) {
  const n       = values.length;
  const GROUP_W = CHART_W / n;
  const BAR_W   = Math.min(19, Math.max(6, GROUP_W - 8));
  const usableW = CHART_W - 2 * CHART_EDGE_PAD;
  const barStep = n > 1 ? (usableW - BAR_W) / (n - 1) : 0;
  // Height is driven by magnitude regardless of sign — a period that
  // overspent by 400 and one that saved 400 are the same height, coloured
  // oppositely.
  const maxVal  = Math.max(...values.map(Math.abs), 1);
  const svgH    = BAR_HEIGHT + 22;
  const noSpendDotColor = light ? 'rgba(34,197,94,0.7)' : 'rgba(74,222,128,0.75)';

  const gridColor       = light ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)';
  const labelActiveColor = light ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.85)';
  const labelDimColor    = textColor(light).disabled;
  // Same card background the bars themselves sit on (matches the bg/light
  // pair used everywhere else in the app, e.g. TransactionItem) — used as
  // an opaque mask under each bar so a bar's semi-transparent fill doesn't
  // show whatever's drawn behind it. See Bar's own comment.
  const bgColor = light ? '#FAFAF8' : '#000000';

  return (
    <Svg viewBox={`0 0 ${CHART_W} ${svgH}`} style={{ width: '100%', aspectRatio: CHART_W / svgH }}>
      <Line x1={0} y1={BAR_HEIGHT} x2={CHART_W} y2={BAR_HEIGHT} stroke={gridColor} strokeWidth="0.8" strokeDasharray="3.5 3" />

      {values.map((v, i) => {
        const x = CHART_EDGE_PAD + i * barStep;
        // Rounded to a whole pixel — a bar whose value sits at or near
        // maxVal (the tallest bar in the set) computes height through
        // Math.sqrt(v / maxVal), which floating-point division can round
        // to something like 0.9999999999999999 instead of a clean 1 on one
        // render and exactly 1 on the next, depending on tiny variations
        // in how `values` itself got summed. Bar's own effect re-triggers
        // its tween on *any* targetHeight change, so that sub-pixel noise
        // alone was enough to replay a (visually pointless, since it's an
        // imperceptible height difference) animation over and over — most
        // noticeable on whichever bar happens to be tallest, since that's
        // the one most likely sitting right at this knife's-edge value.
        const mag        = Math.abs(v);
        const h          = Math.round(useSqrtScale ? Math.sqrt(mag / maxVal) * BAR_HEIGHT : (mag / maxVal) * BAR_HEIGHT);
        const tone       = toneFor(v, isIncome);
        const isActive   = i === activeIndex || i === accentIndex;
        const isDisabled = disabledAfterIndex != null && i > disabledAfterIndex;
        const isBeforeStart = disabledBeforeIndex != null && i < disabledBeforeIndex;
        const hasData    = h > 0;
        const isPadding  = hideLabelAfterIndex != null && i > hideLabelAfterIndex;
        const showLabel  = !isPadding && (i % labelStep === 0 || (i === n - 1 && (n - 1) - Math.floor((n - 2) / labelStep) * labelStep > 1));

        return (
          // Keyed by animKey too, not just index — this is what forces a
          // genuinely fresh Bar instance (a true useSharedValue(0) start,
          // see Bar's own comment) on every period switch, instead of
          // reusing the one already there and tweening it to the new
          // height in place.
          <Fragment key={`${animKey}-${i}`}>
            {hasData ? (
              <Bar
                x={x}
                width={BAR_W}
                rx={BAR_W / 2.6}
                targetHeight={h}
                delay={Math.min(i * BAR_STAGGER_STEP_MS, BAR_STAGGER_CAP_MS)}
                fill={isActive ? tone.active : tone.dim}
                maskColor={bgColor}
                instant={instant}
              />
            ) : (
              <Rect x={x} y={BAR_HEIGHT - 2} width={BAR_W} height={2} rx={1} fill="transparent" />
            )}

            {showLabel && (
              <SvgText
                x={x + BAR_W / 2}
                y={BAR_HEIGHT + 15}
                textAnchor="middle"
                fontSize="9"
                fill={isActive ? labelActiveColor : labelDimColor}
                fontWeight={isActive ? '600' : '400'}
              >
                {labels[i]}
              </SvgText>
            )}

            {/* Small "no spend" marker — every zero-value day gets one,
                independent of labelStep, so the pattern reads at a glance
                across the whole month rather than only on labeled days.
                Sits just above the baseline grid line, in the empty column
                where that day's bar would otherwise start. Skipped for
                disabled (not-yet-happened) days — those are zero because
                the day hasn't occurred, not because nothing was spent —
                and for days before the account's earliest-known activity,
                same reasoning: a day the user didn't exist for yet isn't a
                "no spend" day, it's just not their data. */}
            {noSpendDots && !hasData && !isDisabled && !isBeforeStart && (
              <NoSpendDot
                cx={x + BAR_W / 2}
                cy={BAR_HEIGHT - 3}
                r={1.8}
                fill={noSpendDotColor}
                delay={Math.min(i * BAR_STAGGER_STEP_MS, BAR_STAGGER_CAP_MS)}
                instant={instant}
              />
            )}
          </Fragment>
        );
      })}
    </Svg>
  );
}

export default memo(BarChart);
