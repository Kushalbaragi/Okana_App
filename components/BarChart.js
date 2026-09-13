import { memo, useEffect, Fragment } from 'react';
import Svg, { Line, Rect, Circle, Text as SvgText } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedProps, withDelay, withTiming, Easing } from 'react-native-reanimated';

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const BAR_HEIGHT = 110;
const CHART_W    = 264;
// A flat per-bar step (capped, not spread proportionally across a fixed
// total budget) — spreading a fixed budget across the bar count shrinks the
// gap between consecutive bars as there are more of them (e.g. 120ms over
// 12 bars is ~11ms apart, barely perceptible as anything but "all at once").
// A flat step keeps the same visible gap between the first several bars
// regardless of how many are on screen; the cap just stops a many-bar view
// (like "All Time") from taking forever for the *later* ones to start.
const BAR_STAGGER_STEP_MS = 55;
const BAR_STAGGER_CAP_MS  = 450;

function Bar({ x, width, rx, targetHeight, delay, fill }) {
  // Animates the actual pixel height directly (not a 0-1 progress scaled by
  // targetHeight). Always grows from 0 — every period switch mounts a
  // genuinely fresh Bar instance (see the key in the render loop below),
  // so useSharedValue(0)'s own initial value is what gives the grow-in,
  // with no explicit reset step or isNewPeriod branch needed here. A
  // same-period value update (e.g. a live transaction landing) reuses the
  // same instance instead, so that case still tweens smoothly from
  // whatever height it's currently at rather than collapsing to 0.
  //
  // Tried letting every switch reuse the same instance and just tween
  // straight to the new height, same as the same-period case — faster in
  // theory, but with several bars moving to different new heights at once
  // (some up, some down) it read as the bars "dancing" rather than a clean
  // reveal. A uniform grow-from-0 is calmer to watch even though more
  // pixels are moving.
  const animatedHeight = useSharedValue(0);

  useEffect(() => {
    animatedHeight.value = withDelay(delay, withTiming(targetHeight, { duration: 260, easing: Easing.out(Easing.cubic) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetHeight]);

  // Tried anchoring a scaleY transform at the baseline via react-native-svg's
  // `origin` prop (to avoid animating layout props every frame) — on native
  // it didn't anchor where expected, so bars grew from a fixed top edge
  // downward instead of from the baseline upward. Animating height/y
  // directly is the reliable way to get "grows from the bottom" here.
  const animatedProps = useAnimatedProps(() => ({
    height: animatedHeight.value,
    y: BAR_HEIGHT - animatedHeight.value,
  }));

  // No onPress here — see the static touch-target Rect rendered alongside
  // this in BarChart below, and the comment on it explaining why.
  return (
    <AnimatedRect
      x={x}
      width={width}
      rx={rx}
      fill={fill}
      animatedProps={animatedProps}
    />
  );
}

// Fades in on the same stagger schedule as the Bar it stands in for, and
// the same "no special-casing" reasoning as Bar above — see its comment.
function NoSpendDot({ cx, cy, r, fill, delay }) {
  const opacity = useSharedValue(0);

  useEffect(() => {
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
function BarChart({ values, labels, activeIndex, onBarClick, onDeselect, disabledAfterIndex, disabledBeforeIndex, hideLabelAfterIndex, isIncome, animKey, labelStep = 1, useSqrtScale = false, light = false, noSpendDots = false }) {
  const n       = values.length;
  const GROUP_W = CHART_W / n;
  const BAR_W   = Math.min(16, Math.max(6, GROUP_W - 10));
  const maxVal  = Math.max(...values, 1);
  const svgH    = BAR_HEIGHT + 22;
  const noSpendDotColor = light ? 'rgba(34,197,94,0.7)' : 'rgba(74,222,128,0.75)';

  const activeColor = isIncome ? 'rgba(22,163,74,0.95)' : 'rgba(255,59,48,0.92)';
  const dimColor    = isIncome ? 'rgba(22,163,74,0.62)' : 'rgba(255,59,48,0.56)';
  const gridColor       = light ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)';
  const labelActiveColor = light ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.85)';
  const labelDimColor    = light ? 'rgba(0,0,0,0.30)' : 'rgba(255,255,255,0.22)';

  return (
    <Svg viewBox={`0 0 ${CHART_W} ${svgH}`} style={{ width: '100%', aspectRatio: CHART_W / svgH }}>
      {onDeselect && (
        <Rect x={0} y={0} width={CHART_W} height={BAR_HEIGHT} fill="transparent" onPress={onDeselect} />
      )}

      <Line x1={0} y1={BAR_HEIGHT + 2} x2={CHART_W} y2={BAR_HEIGHT + 2} stroke={gridColor} strokeWidth="0.8" strokeDasharray="2 3" />

      {values.map((v, i) => {
        const x          = i * GROUP_W + (GROUP_W - BAR_W) / 2;
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
        const h          = Math.round(useSqrtScale ? Math.sqrt(v / maxVal) * BAR_HEIGHT : (v / maxVal) * BAR_HEIGHT);
        const isActive   = i === activeIndex;
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
                rx={BAR_W / 3}
                targetHeight={h}
                delay={Math.min(i * BAR_STAGGER_STEP_MS, BAR_STAGGER_CAP_MS)}
                fill={isActive ? activeColor : dimColor}
              />
            ) : (
              <Rect x={x} y={BAR_HEIGHT - 2} width={BAR_W} height={2} rx={1} fill="transparent" />
            )}

            {/* A separate, never-animated full-column touch target instead
                of onPress on the bar itself — react-native-svg's native hit
                region for a shape driven by useAnimatedProps (height/y
                updated on the UI thread) doesn't reliably stay in sync with
                what's visually on screen, so a tap during or right after
                the grow animation could land on a stale hit box and miss,
                needing repeated taps to register. This stays a constant
                full-height rect regardless of animation state. */}
            {hasData && onBarClick && (
              <Rect
                x={x}
                y={0}
                width={BAR_W}
                height={BAR_HEIGHT}
                fill="transparent"
                onPress={() => !isDisabled && onBarClick(i)}
              />
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
              />
            )}
          </Fragment>
        );
      })}
    </Svg>
  );
}

export default memo(BarChart);
