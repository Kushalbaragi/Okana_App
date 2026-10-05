import { memo, useEffect, useRef } from 'react';
import { View, Text } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { dim } from './savingsShared';
import { textColor } from '../utils/colors';
import { FONT } from '../utils/type';

const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
// Bigger than before, now that the month columns flex to fill the card's
// own width (see below) instead of sitting at a fixed size — the dots
// stretching only made the leftover space more obvious, so they're sized to
// actually use it rather than floating in a wider column around the same
// small circle.
const DOT = 17;
const LABEL_W = 46;
const FILLED = '#4ade80';

function Dot({ paid, inRange, light }) {
  // 0 = outline only, 1 = filled. A dot that turns paid while on screen fills
  // in slowly with one soft ring spreading off it; one that is already paid
  // when the grid appears is simply drawn filled.
  const fill = useSharedValue(paid ? 1 : 0);
  const ring = useSharedValue(0);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    fill.value = withTiming(paid ? 1 : 0, { duration: 900, easing: Easing.out(Easing.cubic) });
    if (paid) {
      ring.value = 0;
      ring.value = withTiming(1, { duration: 1200, easing: Easing.out(Easing.quad) });
    }
  }, [paid, fill, ring]);
  const fillStyle = useAnimatedStyle(() => ({ opacity: fill.value, transform: [{ scale: 0.4 + 0.6 * fill.value }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: 0.4 * (1 - ring.value) * (ring.value > 0 ? 1 : 0), transform: [{ scale: 1 + ring.value * 1.1 }] }));

  // Months before the loan started tracking, or past its tenure — no
  // circle at all, just the column's own empty space, so the grid shows
  // only months that were actually part of the loan.
  if (!inRange) {
    return <View style={{ width: DOT, height: DOT }} />;
  }
  return (
    <View style={{ width: DOT, height: DOT, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: 1.5, borderColor: dim(light, 0.18) }} />
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: FILLED }, ringStyle]} />
      <Animated.View style={[{ width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: FILLED }, fillStyle]} />
    </View>
  );
}

// A year-by-month grid of paid/unpaid EMIs, read like a habit tracker rather
// than a chart — a loan's monthly payment barely moves month to month, so a
// net-amount line (see MonthSlider, Savings' own equivalent) has nothing
// useful to say; whether that month's EMI landed is the thing worth seeing.
// A filled dot is a month with a logged payment, an outlined dot is a month
// still due, and a near-invisible dot is outside the loan's own tracked span
// (before it was added, or past its tenure).
function PaymentGrid({ years, light }) {
  return (
    <View>
      <View style={{ flexDirection: 'row', marginBottom: 10 }}>
        <View style={{ width: LABEL_W }} />
        {MONTH_LETTERS.map((letter, i) => (
          <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: FONT.label, color: textColor(light).disabled }}>{letter}</Text>
        ))}
      </View>
      {years.map(({ year, cells }) => (
        <View key={year} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          {/* paddingRight, not a wider LABEL_W alone — keeps the year clear
              of the first dot's column without shifting every month column
              after it out of line with its own header letter above. */}
          <Text numberOfLines={1} style={{ width: LABEL_W, paddingRight: 8, fontSize: FONT.caption, color: textColor(light).tertiary }}>{year}</Text>
          {cells.map((cell, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center' }}>
              <Dot paid={cell.paid} inRange={cell.inRange} light={light} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export default memo(PaymentGrid);
