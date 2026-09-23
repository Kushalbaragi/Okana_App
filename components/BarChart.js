import { memo, useEffect, useRef, Fragment } from 'react';
import Svg, { Line, Rect, Circle, Path, Text as SvgText } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedProps, withDelay, withTiming, Easing } from 'react-native-reanimated';
import { formatCurrency } from '../utils/format';
import { textColor, EXPENSE, EXPENSE_DIM, INCOME, INCOME_DIM } from '../utils/colors';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedSvgText = Animated.createAnimatedComponent(SvgText);

// The two bar colours; isIncome picks which one a chart uses. See the data
// colour block in utils/colors.js for what they mean and why these two are
// the only colours in the app.
const GREEN_TONE = { active: INCOME, dim: INCOME_DIM };
const RED_TONE   = { active: EXPENSE, dim: EXPENSE_DIM };

const BAR_HEIGHT = 110;
const CHART_W    = 264;
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

// The average line rises into place from slightly below and drops back down
// on its way out, fading as it goes — so it reads as settling onto the
// chart rather than being switched on. Small on purpose: it's a reference
// mark, and a long travel would pull attention off the bars it annotates.
const AVG_SLIDE_PX = 10;
const AVG_FADE_MS  = 300;
// Slightly longer than the fade so the movement is still finishing as the
// line reaches full opacity, rather than arriving and then continuing to
// visibly drift.
const AVG_MOVE_MS  = 360;
const AVG_EASING   = Easing.out(Easing.cubic);

function Bar({ x, width, rx, targetHeight, delay, fill, maskColor }) {
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
  const animatedHeight = useSharedValue(0);
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
  const hasRevealedRef = useRef(false);

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

// The average mark is two separate elements because they sit at different
// depths in the SVG — the line is drawn before the bars so a taller bar
// covers it, the label after them so text is never obscured. Both read from
// the SAME two shared values (owned by BarChart below) rather than each
// running its own copy of the animation, so the label can't drift a frame
// out of step with the line it belongs to.
function AverageLineMark({ progress, lineY, endX, color }) {
  const animatedProps = useAnimatedProps(() => ({
    y1: lineY.value,
    y2: lineY.value,
    opacity: progress.value,
  }));

  return (
    <AnimatedLine
      x1={0}
      x2={endX}
      stroke={color}
      strokeWidth="1"
      strokeDasharray="3 3"
      animatedProps={animatedProps}
    />
  );
}

function AverageLineLabel({ progress, lineY, label, color }) {
  // +3 keeps the text optically centred on the line, matching where the
  // static version sat.
  const animatedProps = useAnimatedProps(() => ({
    y: lineY.value + 3,
    opacity: progress.value,
  }));

  return (
    <AnimatedSvgText
      x={CHART_W}
      textAnchor="end"
      fontSize="8"
      fill={color}
      animatedProps={animatedProps}
    >
      {label}
    </AnimatedSvgText>
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
// `topPad` (optional) is room left above the top of the bars, in chart units. The
// average line sits at the top edge when the average is as tall as the tallest
// bar, and its label is centred on the line, so with no room above them both are
// half cut off. Callers that show the average pass it, and pass it for every
// range so the chart doesn't change height as the line comes and goes.
function BarChart({ values, labels, activeIndex, accentIndex = null, disabledAfterIndex, disabledBeforeIndex, hideLabelAfterIndex, isIncome, animKey, labelStep = 1, useSqrtScale = false, light = false, noSpendDots = false, showAverage = false, topPad = 0 }) {
  const n       = values.length;
  const GROUP_W = CHART_W / n;
  const BAR_W   = Math.min(19, Math.max(6, GROUP_W - 8));
  const usableW = CHART_W - 2 * CHART_EDGE_PAD;
  const barStep = n > 1 ? (usableW - BAR_W) / (n - 1) : 0;
  const maxVal  = Math.max(...values, 1);
  const svgH    = BAR_HEIGHT + 22;
  const noSpendDotColor = light ? 'rgba(34,197,94,0.7)' : 'rgba(74,222,128,0.75)';

  // Kept in step with LineChart's own income/expense colours, so Overview
  // and the bar tabs read as the same two series. The expense red is
  // #ef4444 lifted about 10% (each channel x1.1, red clamped at 255) — at
  // these alphas the original sat a touch dark against pure black. Note
  // this is NOT the danger red used on destructive UI (248,113,113), nor
  // the delete button's own systemRed; both of those are button states
  // rather than data, and are deliberately left alone.
  const baseTone = isIncome ? GREEN_TONE : RED_TONE;
  // With `accentIndex` set, exactly one bar carries the series colour and
  // every other one goes flat neutral — one accent doing the work, so the
  // eye lands on the period being read instead of scanning thirty coloured
  // bars. Left null by the recap's charts, which colour every bar (one of
  // them has no active bar at all and would otherwise render entirely grey).
  const dimFill = accentIndex == null
    ? baseTone.dim
    : (light ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)');
  const gridColor       = light ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)';
  const labelActiveColor = light ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.85)';
  const labelDimColor    = textColor(light).disabled;
  // Same card background the bars themselves sit on (matches the bg/light
  // pair used everywhere else in the app, e.g. TransactionItem) — used as
  // an opaque mask under each bar so the average line actually disappears
  // behind a taller bar instead of showing through its semi-transparent
  // fill. See Bar's own comment.
  const bgColor = light ? '#FAFAF8' : '#000000';
  // A touch more visible than the baseline grid line (0.10) — it needs to
  // read as an intentional reference mark, not another faint ruled line —
  // but still clearly secondary to the bars themselves, which is also why
  // it's drawn before them below: a bar taller than the average visually
  // covers the line right where that's true, rather than the line cutting
  // across on top of every bar regardless of whether that bar is the one
  // the average is even about.
  const avgLineColor  = light ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)';
  const avgLabelColor = textColor(light).disabled;

  // Only real periods count — the same start/end bounds disabledBefore/
  // AfterIndex already use to mark "before the account existed" and
  // "hasn't happened yet" bars. A genuine no-spend day inside that range
  // still counts as a real 0, same as it does everywhere else in the app;
  // it's only padding outside the range that's excluded.
  let avgY = null;
  let avgLabel = null;
  let avgLineEndX = CHART_W;
  if (showAverage) {
    const startIdx = disabledBeforeIndex ?? 0;
    const endIdx = disabledAfterIndex ?? (n - 1);
    const realValues = endIdx >= startIdx ? values.slice(startIdx, endIdx + 1) : [];
    const total = realValues.reduce((a, b) => a + b, 0);
    // Nothing recorded in this period at all — an "Avg ₹0" pinned to the
    // baseline is not a reference line, it's a second axis line sitting on
    // top of the real one. This also covers the window before the first
    // load resolves, when every value is still 0.
    //
    // And nothing to average over a single period: the first day of a month, the
    // first month of a year, or the day of the very first transaction. The line
    // would just be drawn across the one bar it is the average of.
    if (total > 0 && realValues.length >= 2) {
      const avg = total / realValues.length;
      const avgH = Math.round(useSqrtScale ? Math.sqrt(avg / maxVal) * BAR_HEIGHT : (avg / maxVal) * BAR_HEIGHT);
      avgY = BAR_HEIGHT - avgH;
      avgLabel = `Avg ${formatCurrency(avg)}`;
      // Rough per-character estimate at this fontSize (8) — the line stops
      // short of the label's own width (plus a small gap) instead of
      // running the dashes straight through the text underneath it.
      avgLineEndX = CHART_W - avgLabel.length * 4.3 - 6;
    }
  }

  // Held so the line/label can animate OUT after avgY has already gone
  // null — without this the text would blank and the line snap to full
  // width the instant the data went away, mid-fade.
  const lastAvgRef = useRef({ label: '', endX: CHART_W });
  if (avgLabel != null) lastAvgRef.current = { label: avgLabel, endX: avgLineEndX };
  const shownAvgLabel = avgLabel ?? lastAvgRef.current.label;
  const shownAvgEndX  = avgLabel != null ? avgLineEndX : lastAvgRef.current.endX;

  const avgProgress = useSharedValue(0);
  const avgLineY    = useSharedValue(BAR_HEIGHT);
  const avgShownRef = useRef(false);
  const prevAnimKeyRef = useRef(animKey);
  // Waits out the bars' own stagger so the reference line settles on top of
  // a chart that's already there, instead of racing the data it describes.
  const avgRevealDelay = Math.min((n - 1) * BAR_STAGGER_STEP_MS, BAR_STAGGER_CAP_MS) + 80;

  useEffect(() => {
    // A period switch regrows every bar from 0 (see the animKey in the
    // render loop's key below), so the line re-reveals with them rather
    // than gliding from the old period's height to the new one — that
    // glide reads as the line meaning something continuous across two
    // periods that have nothing to do with each other.
    if (prevAnimKeyRef.current !== animKey) {
      prevAnimKeyRef.current = animKey;
      avgShownRef.current = false;
      avgProgress.value = 0;
    }

    if (avgY != null) {
      if (!avgShownRef.current) {
        avgShownRef.current = true;
        // Parked below the target first (instantly, still invisible), then
        // released so it rises into place as it fades in.
        avgLineY.value = avgY + AVG_SLIDE_PX;
        avgLineY.value = withDelay(avgRevealDelay, withTiming(avgY, { duration: AVG_MOVE_MS, easing: AVG_EASING }));
        avgProgress.value = withDelay(avgRevealDelay, withTiming(1, { duration: AVG_FADE_MS, easing: AVG_EASING }));
      } else {
        // Already on screen and the average itself moved — slide straight
        // to the new height, no re-fade.
        avgLineY.value = withTiming(avgY, { duration: AVG_MOVE_MS, easing: AVG_EASING });
        avgProgress.value = withTiming(1, { duration: AVG_FADE_MS, easing: AVG_EASING });
      }
    } else if (avgShownRef.current) {
      // Nothing to average any more — drop away and fade out.
      avgShownRef.current = false;
      avgProgress.value = withTiming(0, { duration: AVG_FADE_MS, easing: AVG_EASING });
      avgLineY.value = withTiming(avgLineY.value + AVG_SLIDE_PX, { duration: AVG_MOVE_MS, easing: AVG_EASING });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avgY, animKey, avgRevealDelay]);

  return (
    <Svg viewBox={`0 ${-topPad} ${CHART_W} ${svgH + topPad}`} style={{ width: '100%', aspectRatio: CHART_W / (svgH + topPad) }}>
      <Line x1={0} y1={BAR_HEIGHT} x2={CHART_W} y2={BAR_HEIGHT} stroke={gridColor} strokeWidth="0.8" strokeDasharray="3.5 3" />

      {/* Just the line here, drawn before the bars below (not after) so it
          renders behind them — see avgLineColor's comment above and Bar's
          own mask-rect comment for how a taller bar actually hides it
          instead of just showing through. The label itself is drawn last,
          after every bar — see the block at the bottom of this Svg. */}
      {showAverage && (
        <AverageLineMark
          progress={avgProgress}
          lineY={avgLineY}
          endX={shownAvgEndX}
          color={avgLineColor}
        />
      )}

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
        const h          = Math.round(useSqrtScale ? Math.sqrt(v / maxVal) * BAR_HEIGHT : (v / maxVal) * BAR_HEIGHT);
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
                fill={isActive ? baseTone.active : dimFill}
                maskColor={bgColor}
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
              />
            )}
          </Fragment>
        );
      })}

      {/* Drawn last, after every bar, so it stays legible even when the
          last several days' bars are tall enough to reach into its row —
          only the reference line itself (above) respects bar height, the
          text is exempt from being covered. */}
      {showAverage && (
        <AverageLineLabel
          progress={avgProgress}
          lineY={avgLineY}
          label={shownAvgLabel}
          color={avgLabelColor}
        />
      )}
    </Svg>
  );
}

export default memo(BarChart);
