import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Svg, { Defs, LinearGradient, Stop, Path, Circle, Line, Text as SvgText, G } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { textColor, EXPENSE, EXPENSE_DIM, EXPENSE_HEX, INCOME, INCOME_DIM, INCOME_HEX } from '../utils/colors';

const CHART_W = 300;
const CHART_H = 90;
const PAD_TOP = 12;
const LABEL_H = 16;

const REVEAL_DURATION = 950;
// SummaryCard's horizontal chrome around the chart (mx-4, both sides) — only
// used to guess the chart's width before it has been measured, see below.
// onLayout still has the final say.
const CARD_CHROME_W = 32;
// The last width onLayout reported, kept across mounts. The chart remounts
// every time the Overview tab is re-entered, and the width doesn't change
// between those, so every mount after the first starts from the exact value.
let lastMeasuredWidth = 0;

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

function LineChart({ incomeData, expenseData, labels, light = false, activeIndex = -1, revealKey, instant = false, disabledAfterIndex = null, maxLabels = 6 }) {
  const progress = useSharedValue(0);
  // The reveal-width animation needs a real pixel target, not a percentage —
  // Reanimated interpolates numbers reliably. Measured via onLayout, but
  // *seeded* with an estimate (last known width, else the window minus the
  // card's chrome) instead of 0. Starting from 0 meant the first pass
  // rendered nothing at all, and the whole SVG only mounted in a second pass
  // after onLayout came back — an empty frame plus an extra commit on every
  // entry to Overview. With a seed it mounts in the first pass, and onLayout
  // just corrects it if the guess was off (setState with the same value is
  // a no-op, so the usual case costs nothing).
  const { width: windowWidth } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(
    () => lastMeasuredWidth || Math.max(0, windowWidth - CARD_CHROME_W),
  );
  const handleLayout = useCallback(e => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) lastMeasuredWidth = w;
    setContainerWidth(w);
  }, []);
  const svgH = PAD_TOP + CHART_H + LABEL_H;

  // The left-to-right growing reveal plays every time the chart is entered
  // or its range changes: on every mount (switching to the Overview tab
  // from Expense/Income remounts it), whenever `revealKey` changes (the
  // Month/Year/All Time pills — the chart stays mounted across those, so it
  // has to be told), and again whenever the home screen regains focus — it
  // stays mounted underneath Account/Subscription in the stack, so coming
  // back from those never remounts the chart and used to show it already
  // fully drawn. Selecting a point within a range doesn't replay it.
  //
  // Starts on mount rather than waiting for a measured width (progress is a
  // plain 0→1 number, independent of it), so the timer isn't held up behind
  // layout.
  const playReveal = useCallback(() => {
    progress.value = 0;
    progress.value = withTiming(1, { duration: REVEAL_DURATION, easing: Easing.linear });
  }, [progress]);

  useEffect(() => { playReveal(); }, [playReveal]);

  // A layout effect, not a regular one: the new range's curve is already in
  // this same commit, so a regular effect would let it paint fully drawn for
  // a frame before the reveal reset it to empty and grew it back.
  //
  // `instant` only applies here, not to the mount effect above — entering
  // Overview (a real mode change, and a fresh mount) always gets the full
  // sweep; a Month/Year/All swipe while already on Overview is what skips
  // it, same reasoning as Bar's own `instant` in BarChart.js.
  const prevRevealKeyRef = useRef(revealKey);
  useLayoutEffect(() => {
    if (prevRevealKeyRef.current === revealKey) return;
    prevRevealKeyRef.current = revealKey;
    if (instant) {
      progress.value = 1;
      return;
    }
    playReveal();
  }, [revealKey, playReveal, instant, progress]);

  const isFocused = useIsFocused();
  const wasFocusedRef = useRef(isFocused);
  useEffect(() => {
    if (isFocused && !wasFocusedRef.current) playReveal();
    wasFocusedRef.current = isFocused;
  }, [isFocused, playReveal]);

  // A left-to-right "growing" reveal, done via a plain View's overflow:hidden
  // + an animated pixel width — NOT the SVG-level clipPath + AnimatedRect
  // this used previously, which relied on useAnimatedProps driving a native
  // SVG node and silently never painted on Android (the clip stayed at
  // width 0 forever). Plain View width/overflow animation is the same
  // proven-safe primitive used for every other reveal in this app.
  const revealStyle = useAnimatedStyle(() => ({ width: containerWidth * progress.value }));

  // Everything that depends only on the data — rebuilt when the data
  // changes, not on every render. Tapping a point re-renders this with a new
  // activeIndex, which used to redo all of it (four path strings across up to
  // 31 points) just to move a marker.
  const geometry = useMemo(() => {
    const count = incomeData.length;
    if (count < 2) return null;
    // The x-axis (step, labels) always spans the FULL series — a Year chart
    // keeps all 12 months' worth of spacing even mid-year — but the lines
    // themselves only draw up through disabledAfterIndex: a future month
    // that hasn't happened yet plotted as a real 0 would otherwise read as
    // "income/expense dropped to zero," not "hasn't happened yet." Slicing
    // the point arrays (rather than the incoming data) is what keeps the x
    // position of each real point anchored to its true index in the full
    // 12-month scale instead of being squeezed into a shorter chart.
    const drawCount = disabledAfterIndex != null && disabledAfterIndex >= 0
      ? Math.min(count, disabledAfterIndex + 1)
      : count;
    const maxVal = Math.max(...incomeData, ...expenseData, 1);
    const step   = CHART_W / (count - 1);
    const base   = PAD_TOP + CHART_H;
    const toPoints = data => data.slice(0, drawCount).map((v, i) => ({
      x: i * step,
      y: PAD_TOP + CHART_H - (v / maxVal) * CHART_H,
    }));
    const incPts = toPoints(incomeData);
    const expPts = toPoints(expenseData);
    return {
      n: count,
      drawCount,
      stepX: step,
      bottom: base,
      incomePts: incPts,
      expensePts: expPts,
      incomeLine: smoothPath(incPts),
      expenseLine: smoothPath(expPts),
      incomeArea: areaPath(incPts, base),
      expenseArea: areaPath(expPts, base),
    };
  }, [incomeData, expenseData, disabledAfterIndex]);

  if (!geometry) return null;

  const { n, drawCount, stepX, bottom, incomePts, expensePts, incomeLine, expenseLine, incomeArea, expenseArea } = geometry;

  // Scales the skip to a target label count instead of a flat "every
  // other" — a fixed stride of 2 still crowded/overlapped "MMM YY" labels
  // once "All Time" spanned enough months (e.g. 20+), since each one is
  // wide relative to the chart. Capping around maxLabels keeps the axis
  // readable regardless of how much history is on screen. The default (6)
  // is sized for "MMM YY"-width labels; Year passes 12 since its labels are
  // single letters (J/F/M/…) and all 12 fit without crowding.
  const labelStride = n <= maxLabels ? 1 : Math.ceil(n / maxLabels);
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
  // last REAL point (drawCount - 1, not the full series' n - 1) when
  // nothing's selected, same fallback shape as BarChart's activeIndex=-1
  // convention. n - 1 would point past the truncated pts arrays whenever
  // disabledAfterIndex cut the series short (e.g. Year, mid-year).
  const markerIndex = activeIndex >= 0 ? activeIndex : drawCount - 1;
  const isSelected = activeIndex >= 0;

  return (
    <View
      style={{ width: '100%', aspectRatio: CHART_W / svgH }}
      onLayout={handleLayout}
    >
      {containerWidth > 0 && (
        // Two stacked SVGs, same viewBox/size so they align pixel-for-pixel —
        // splitting chrome (baseline, axis labels) from data (the two lines,
        // their fills, and the marker) is what lets only the data grow in.
        // A single clipped SVG (the old layout) revealed everything inside
        // it together, baseline and labels included, which read as the
        // whole chart growing rather than just its two lines.
        <View style={{ width: containerWidth, height: svgPixelHeight }}>
          <Svg
            width={containerWidth} height={svgPixelHeight} viewBox={`0 0 ${CHART_W} ${svgH}`}
            style={{ position: 'absolute', top: 0, left: 0 }}
          >
            <Line x1={0} y1={bottom} x2={CHART_W} y2={bottom} stroke={light ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.18)'} strokeWidth="1" strokeDasharray="2 3" />

            {labels.map((lbl, i) => showLabel(i) && lbl && (
              <SvgText
                key={i}
                x={i * stepX}
                y={svgH - 2}
                textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
                fontSize="8.5"
                fill={textColor(light).disabled}
              >
                {lbl}
              </SvgText>
            ))}
          </Svg>

          <Animated.View style={[{ position: 'absolute', top: 0, left: 0, overflow: 'hidden' }, revealStyle]}>
            <Svg width={containerWidth} height={svgPixelHeight} viewBox={`0 0 ${CHART_W} ${svgH}`}>
              <Defs>
                <LinearGradient id="ig" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%"   stopColor={INCOME_HEX} stopOpacity="0.16" />
                  <Stop offset="100%" stopColor={INCOME_HEX} stopOpacity="0" />
                </LinearGradient>
                <LinearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%"   stopColor={EXPENSE_HEX} stopOpacity="0.13" />
                  <Stop offset="100%" stopColor={EXPENSE_HEX} stopOpacity="0" />
                </LinearGradient>
              </Defs>

              <G>
                <Path d={incomeArea}  fill="url(#ig)" />
                <Path d={expenseArea} fill="url(#eg)" />

                <Path d={expenseLine} stroke={EXPENSE_DIM} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                <Path d={incomeLine}  stroke={INCOME_DIM}  strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />

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
                <Circle cx={incomePts[markerIndex].x}  cy={incomePts[markerIndex].y}  r={isSelected ? 3 : 1.75} fill={INCOME} />
                <Circle cx={expensePts[markerIndex].x} cy={expensePts[markerIndex].y} r={isSelected ? 3 : 1.75} fill={EXPENSE} />
              </G>
            </Svg>
          </Animated.View>
        </View>
      )}
    </View>
  );
}

export default memo(LineChart);
