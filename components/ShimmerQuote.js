import { memo, useEffect, useMemo } from 'react';
import { View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import { FONT } from '../utils/type';

// A line of text with a soft light that passes over it, left to right (the way it
// reads), again and again. Done a letter at a time: each letter's
// opacity comes from one shared value on the UI thread, so it needs no re-renders and
// stays smooth however long the line is. Letters are grouped by word, so it wraps
// like ordinary text.
const SWEEP_MS = 4400;     // very slow: the light takes its time crossing the line
const SPREAD = 9;          // letters the light spans each side of its centre, wide and soft
const BASE = 0.45;         // how bright a letter is when the light isn't on it
const LINE_HEIGHT = 22;
const SPACE = 5;           // the gap between words

function Letter({ i, ch, n, sweep, color, size, lineHeight, textStyle }) {
  const style = useAnimatedStyle(() => {
    const centre = sweep.value * (n + 2 * SPREAD) - SPREAD;
    const near = Math.max(0, 1 - Math.abs(i - centre) / SPREAD);
    return { opacity: BASE + (1 - BASE) * near };
  });
  return <Animated.Text style={[{ fontSize: size, lineHeight, color }, textStyle, style]}>{ch}</Animated.Text>;
}

// `delay` is when, in ms from mount, the light starts. `size`, `lineHeight`, `center` and
// `textStyle` let it stand in for a small label as well as a quote.
function ShimmerQuote({ text, delay = 0, color, size = FONT.body, lineHeight = LINE_HEIGHT, center = false, textStyle }) {
  const words = useMemo(() => text.split(' ').filter(Boolean), [text]);
  const n = useMemo(() => words.reduce((sum, w) => sum + Array.from(w).length, 0), [words]);
  const sweep = useSharedValue(0);

  useEffect(() => {
    sweep.value = 0;
    sweep.value = withDelay(delay, withRepeat(withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.sin) }), -1, false));
    return () => cancelAnimation(sweep);
  }, [sweep, text, delay]);

  let index = 0;
  return (
    <View accessible accessibilityLabel={text} importantForAccessibility="yes">
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: center ? 'center' : 'flex-start' }}>
        {words.map((word, w) => (
          <View key={w} style={{ flexDirection: 'row', marginRight: center && w === words.length - 1 ? 0 : Math.round(SPACE * size / FONT.body) }}>
            {Array.from(word).map((ch, k) => {
              const i = index++;
              return <Letter key={k} i={i} ch={ch} n={n} sweep={sweep} color={color} size={size} lineHeight={lineHeight} textStyle={textStyle} />;
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

export default memo(ShimmerQuote);
