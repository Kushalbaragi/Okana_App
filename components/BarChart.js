import { memo, useEffect, useRef, Fragment } from 'react';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedProps, withDelay, withTiming, Easing } from 'react-native-reanimated';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

const BAR_HEIGHT = 90;
const CHART_W    = 264;

function Bar({ x, width, rx, targetHeight, delay, fill, animKey }) {
  // Animates the actual pixel height directly (not a 0-1 progress scaled by
  // targetHeight) — that's what lets a same-period change smoothly tween
  // from whatever height it's currently at to the new one, rather than
  // only ever being able to animate from 0.
  const animatedHeight = useSharedValue(0);
  // null (not animKey's initial value) so the very first mount still gets
  // the full grow-from-zero reveal — only a later *change* of animKey (a
  // genuinely new period) should replay that. Switching Expense<->Income
  // for the SAME period keeps animKey identical; bars still animate to
  // their new height, just as a quick direct tween with no stagger delay —
  // a full collapse-back-to-0-and-restagger there read as "slow to switch
  // tabs", but snapping instantly read as no animation at all.
  const prevAnimKey = useRef(null);

  useEffect(() => {
    const isNewPeriod = prevAnimKey.current !== animKey;
    prevAnimKey.current = animKey;
    if (isNewPeriod) {
      animatedHeight.value = 0;
      animatedHeight.value = withDelay(delay, withTiming(targetHeight, { duration: 300, easing: Easing.out(Easing.exp) }));
    } else {
      animatedHeight.value = withTiming(targetHeight, { duration: 260, easing: Easing.out(Easing.cubic) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animKey, targetHeight]);

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

function BarChart({ values, labels, activeIndex, onBarClick, onDeselect, disabledAfterIndex, isIncome, animKey, labelStep = 1, useSqrtScale = false }) {
  const n       = values.length;
  const GROUP_W = CHART_W / n;
  const BAR_W   = Math.min(16, Math.max(6, GROUP_W - 10));
  const maxVal  = Math.max(...values, 1);
  const svgH    = BAR_HEIGHT + 22;

  const activeColor = isIncome ? 'rgba(22,163,74,0.95)' : 'rgba(255,59,48,0.92)';
  const dimColor    = isIncome ? 'rgba(22,163,74,0.62)' : 'rgba(255,59,48,0.56)';

  return (
    <Svg viewBox={`0 0 ${CHART_W} ${svgH}`} style={{ width: '100%', aspectRatio: CHART_W / svgH }}>
      {onDeselect && (
        <Rect x={0} y={0} width={CHART_W} height={BAR_HEIGHT} fill="transparent" onPress={onDeselect} />
      )}

      <Line x1={0} y1={BAR_HEIGHT + 2} x2={CHART_W} y2={BAR_HEIGHT + 2} stroke="rgba(255,255,255,0.10)" strokeWidth="0.8" strokeDasharray="2 3" />

      {values.map((v, i) => {
        const x          = i * GROUP_W + (GROUP_W - BAR_W) / 2;
        const h          = useSqrtScale ? Math.sqrt(v / maxVal) * BAR_HEIGHT : (v / maxVal) * BAR_HEIGHT;
        const isActive   = i === activeIndex;
        const isDisabled = disabledAfterIndex != null && i > disabledAfterIndex;
        const hasData    = h > 0;
        const showLabel  = i % labelStep === 0 || (i === n - 1 && (n - 1) - Math.floor((n - 2) / labelStep) * labelStep > 1);

        return (
          <Fragment key={i}>
            {hasData ? (
              <Bar
                x={x}
                width={BAR_W}
                rx={BAR_W / 3}
                targetHeight={h}
                // Spread proportionally across a fixed budget instead of a
                // flat i*45 — that scaled with bar count, so "All Time"
                // views with dozens of bars could take forever to finish
                // staggering in on top of each bar's own animation time.
                // Wide enough (650ms) that bars visibly grow one after
                // another left to right instead of all popping at once,
                // regardless of how many bars are on screen.
                delay={n > 1 ? (i / (n - 1)) * 650 : 0}
                fill={isActive ? activeColor : dimColor}
                animKey={animKey}
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
                fill={isActive ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.22)'}
                fontWeight={isActive ? '600' : '400'}
              >
                {labels[i]}
              </SvgText>
            )}
          </Fragment>
        );
      })}
    </Svg>
  );
}

export default memo(BarChart);
