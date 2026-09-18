import { memo, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Path, Circle, Line, Rect, Text as SvgText, G } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';

const CHART_W = 300;
const CHART_H = 90;
const PAD_TOP = 12;
const LABEL_H = 16;

function smoothPath(pts) {
  if (pts.length < 2) return '';
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1], p1 = pts[i];
    const cpx = ((p0.x + p1.x) / 2).toFixed(1);
    d += ` C${cpx},${p0.y.toFixed(1)} ${cpx},${p1.y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
  }
  return d;
}

function areaPath(pts, bottom) {
  if (pts.length < 2) return '';
  const line = smoothPath(pts);
  return `${line} L${pts[pts.length - 1].x.toFixed(1)},${bottom} L${pts[0].x.toFixed(1)},${bottom} Z`;
}

function LineChart({ incomeData, expenseData, labels, light = false, activeIndex = -1, onPointClick, onDeselect }) {
  const progress = useSharedValue(0);
  // The reveal-width animation needs a real pixel target, not a percentage —
  // Reanimated interpolates numbers reliably; measured once via onLayout
  // rather than assumed, since the chart's rendered width depends on
  // whatever flex context it's placed in.
  const [containerWidth, setContainerWidth] = useState(0);
  const svgH = PAD_TOP + CHART_H + LABEL_H;
  // The left-to-right width reveal is a nice first-impression moment, not
  // something that should replay on every tab/period switch — this used to
  // fire on every animKey change (Month/Year/All Time, Expense/Income/
  // Overview all change it), each time hiding the whole chart and
  // re-growing it over a full second, which is exactly what read as slow.
  // Switching periods now just updates the curve's shape/points instantly
  // instead, same as Bar's height does in BarChart.js.
  const hasRevealedRef = useRef(false);

  useEffect(() => {
    if (!containerWidth || hasRevealedRef.current) return;
    hasRevealedRef.current = true;
    progress.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerWidth]);

  const n = incomeData.length;

  // A left-to-right "growing" reveal, done via a plain View's overflow:hidden
  // + an animated pixel width — NOT the SVG-level clipPath + AnimatedRect
  // this used previously, which relied on useAnimatedProps driving a native
  // SVG node and silently never painted on Android (the clip stayed at
  // width 0 forever). Plain View width/overflow animation is the same
  // proven-safe primitive used for every other reveal in this app.
  const revealStyle = useAnimatedStyle(() => ({ width: containerWidth * progress.value }));

  if (n < 2) return null;

  const allVals = [...incomeData, ...expenseData];
  const maxVal  = Math.max(...allVals, 1);
  const stepX   = CHART_W / (n - 1);
  const bottom  = PAD_TOP + CHART_H;

  function toPoints(data) {
    return data.map((v, i) => ({
      x: i * stepX,
      y: PAD_TOP + CHART_H - (v / maxVal) * CHART_H,
    }));
  }

  const incomePts  = toPoints(incomeData);
  const expensePts = toPoints(expenseData);

  const incomeLine  = smoothPath(incomePts);
  const expenseLine = smoothPath(expensePts);
  const incomeArea  = areaPath(incomePts,  bottom);
  const expenseArea = areaPath(expensePts, bottom);

  // Scales the skip to a target label count instead of a flat "every
  // other" — a fixed stride of 2 still crowded/overlapped "MMM YY" labels
  // once "All Time" spanned enough months (e.g. 20+), since each one is
  // wide relative to the chart. Capping around MAX_LABELS keeps the axis
  // readable regardless of how much history is on screen.
  const MAX_LABELS = 6;
  const labelStride = n <= MAX_LABELS ? 1 : Math.ceil(n / MAX_LABELS);
  // Every-other-label spacing collided with the always-shown last label
  // whenever n was even (e.g. 20 months of "All Time" history) — index
  // n-2 and n-1 both got shown a single stepX apart, overlapping. Suppress
  // a regular label that would land within one stride of the forced last one.
  const showLabel = i => {
    if (i === n - 1) return true;
    if (i % labelStride !== 0) return false;
    return (n - 1 - i) >= labelStride;
  };
  const svgPixelHeight = containerWidth * (svgH / CHART_W);

  // The marker circles follow the active selection — defaulting to the
  // last point (the existing always-on-end behavior) when nothing's
  // selected, same fallback shape as BarChart's activeIndex=-1 convention.
  const markerIndex = activeIndex >= 0 ? activeIndex : n - 1;
  const isSelected = activeIndex >= 0;
  const touchTargetW = n > 1 ? CHART_W / n : CHART_W;

  return (
    <View
      style={{ width: '100%', aspectRatio: CHART_W / svgH }}
      onLayout={e => setContainerWidth(e.nativeEvent.layout.width)}
    >
      {containerWidth > 0 && (
        <Animated.View style={[{ overflow: 'hidden' }, revealStyle]}>
          <Svg width={containerWidth} height={svgPixelHeight} viewBox={`0 0 ${CHART_W} ${svgH}`}>
            <Defs>
              <LinearGradient id="ig" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%"   stopColor="#4ade80" stopOpacity="0.16" />
                <Stop offset="100%" stopColor="#4ade80" stopOpacity="0" />
              </LinearGradient>
              <LinearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%"   stopColor="#FF4B4B" stopOpacity="0.13" />
                <Stop offset="100%" stopColor="#FF4B4B" stopOpacity="0" />
              </LinearGradient>
            </Defs>

            {onDeselect && (
              <Rect x={0} y={0} width={CHART_W} height={bottom} fill="transparent" onPress={onDeselect} />
            )}

            <G>
              <Path d={incomeArea}  fill="url(#ig)" />
              <Path d={expenseArea} fill="url(#eg)" />

              <Path d={expenseLine} stroke="rgba(255,75,75,0.56)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <Path d={incomeLine}  stroke="rgba(74,222,128,0.75)"  strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />

              {/* A vertical guide pinpointing the tapped period — only once
                  something's actually selected, not for the default
                  trailing marker below. */}
              {isSelected && (
                <Line
                  x1={incomePts[markerIndex].x} y1={PAD_TOP} x2={incomePts[markerIndex].x} y2={bottom}
                  stroke={light ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.18)'} strokeWidth="1" strokeDasharray="2 3"
                />
              )}

              {/* Follows the active selection, defaulting to the last point
                  (the original always-on-end marker) when nothing's picked. */}
              <Circle cx={incomePts[markerIndex].x}  cy={incomePts[markerIndex].y}  r={isSelected ? 3 : 2.5} fill="#4ade80" />
              <Circle cx={expensePts[markerIndex].x} cy={expensePts[markerIndex].y} r={isSelected ? 3 : 2.5} fill="rgba(255,75,75,0.92)" />
            </G>

            <Line x1={0} y1={bottom} x2={CHART_W} y2={bottom} stroke={light ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.18)'} strokeWidth="1" strokeDasharray="2 3" />

            {/* Separate, never-animated per-point touch targets — same
                reasoning as BarChart's own full-column hit rects: hovers
                over the actual (curved, thin) line paths would be an
                unreliable tap target, so each period gets a generous
                invisible column instead. */}
            {onPointClick && incomePts.map((p, i) => (
              <Rect
                key={i}
                x={i * stepX - touchTargetW / 2}
                y={0}
                width={touchTargetW}
                height={bottom}
                fill="transparent"
                onPress={() => onPointClick(i)}
              />
            ))}

            {labels.map((lbl, i) => showLabel(i) && lbl && (
              <SvgText
                key={i}
                x={i * stepX}
                y={svgH - 2}
                textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
                fontSize="8.5"
                fill={light ? 'rgba(0,0,0,0.30)' : 'rgba(255,255,255,0.22)'}
              >
                {lbl}
              </SvgText>
            ))}
          </Svg>
        </Animated.View>
      )}
    </View>
  );
}

export default memo(LineChart);
