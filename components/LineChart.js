import { memo, useEffect, useState } from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Path, Circle, Line, Text as SvgText, G } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';

const CHART_W = 300;
const CHART_H = 72;
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

function LineChart({ incomeData, expenseData, labels, animKey }) {
  const progress = useSharedValue(0);
  // The reveal-width animation needs a real pixel target, not a percentage —
  // Reanimated interpolates numbers reliably; measured once via onLayout
  // rather than assumed, since the chart's rendered width depends on
  // whatever flex context it's placed in.
  const [containerWidth, setContainerWidth] = useState(0);
  const svgH = PAD_TOP + CHART_H + LABEL_H;

  useEffect(() => {
    if (!containerWidth) return;
    progress.value = 0;
    progress.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animKey, containerWidth]);

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

  const showLabel = i => n <= 7 || i % 2 === 0 || i === n - 1;
  const svgPixelHeight = containerWidth * (svgH / CHART_W);

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
                <Stop offset="0%"   stopColor="#f87171" stopOpacity="0.13" />
                <Stop offset="100%" stopColor="#f87171" stopOpacity="0" />
              </LinearGradient>
            </Defs>

            <G>
              <Path d={incomeArea}  fill="url(#ig)" />
              <Path d={expenseArea} fill="url(#eg)" />

              <Path d={expenseLine} stroke="rgba(248,113,113,0.65)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <Path d={incomeLine}  stroke="rgba(74,222,128,0.75)"  strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />

              <Circle cx={incomePts[n - 1].x}  cy={incomePts[n - 1].y}  r="2.5" fill="#4ade80" />
              <Circle cx={expensePts[n - 1].x} cy={expensePts[n - 1].y} r="2.5" fill="#f87171" />
            </G>

            <Line x1={0} y1={bottom} x2={CHART_W} y2={bottom} stroke="rgba(255,255,255,0.18)" strokeWidth="1" strokeDasharray="2 3" />

            {labels.map((lbl, i) => showLabel(i) && lbl && (
              <SvgText
                key={i}
                x={i * stepX}
                y={svgH - 2}
                textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
                fontSize="8.5"
                fill="rgba(255,255,255,0.22)"
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
