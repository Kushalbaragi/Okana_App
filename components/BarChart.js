import { memo, useEffect, Fragment } from 'react';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedProps, withDelay, withTiming, Easing } from 'react-native-reanimated';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

const BAR_HEIGHT = 80;
const CHART_W    = 264;

function Bar({ x, width, rx, targetHeight, delay, fill, animKey, onPress, disabled }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(delay, withTiming(1, { duration: 350, easing: Easing.out(Easing.exp) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animKey, targetHeight]);

  // Tried anchoring a scaleY transform at the baseline via react-native-svg's
  // `origin` prop (to avoid animating layout props every frame) — on native
  // it didn't anchor where expected, so bars grew from a fixed top edge
  // downward instead of from the baseline upward. Animating height/y
  // directly is the reliable way to get "grows from the bottom" here.
  const animatedProps = useAnimatedProps(() => {
    const h = targetHeight * progress.value;
    return { height: h, y: BAR_HEIGHT - h };
  });

  return (
    <AnimatedRect
      x={x}
      width={width}
      rx={rx}
      fill={fill}
      animatedProps={animatedProps}
      onPress={disabled ? undefined : onPress}
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
                delay={i * 45}
                fill={isActive ? activeColor : dimColor}
                animKey={animKey}
                onPress={() => onBarClick && !isDisabled && onBarClick(i)}
                disabled={!onBarClick || isDisabled}
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
