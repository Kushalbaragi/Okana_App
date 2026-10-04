import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { ChevronRight } from './icons';

// Text with a soft highlight that travels along it, over and over — the "slide
// to unlock" shimmer. Done a letter at a time (each letter brightens as the
// highlight passes), so it needs nothing but opacity.
//
// The highlight moves from the end of the text to the start, the way a swipe
// to the left does, and `chevrons` left-pointing arrows in front of the text are
// the last thing it lights, pointing where the finger is going.
const SWEEP_MS = 2200;
// How many letters the highlight spans each side of its centre.
const SPREAD = 3;
const DIM = 0.35;

function Piece({ i, sweep, count, children }) {
  const animated = useAnimatedStyle(() => {
    // The highlight starts a spread past the last piece and ends a spread before
    // the first, so it enters and leaves rather than popping.
    const centre = (1 - sweep.value) * (count + 2 * SPREAD) - SPREAD;
    const near = Math.max(0, 1 - Math.abs(i - centre) / SPREAD);
    return { opacity: DIM + (1 - DIM) * near };
  });
  return <Animated.View style={animated}>{children}</Animated.View>;
}

export default function ShimmerText({ children, style, chevrons = 0 }) {
  const sweep = useSharedValue(0);
  useEffect(() => {
    sweep.value = withRepeat(withTiming(1, { duration: SWEEP_MS, easing: Easing.linear }), -1, false);
  }, [sweep]);
  const chars = Array.from(children);
  const count = chevrons + chars.length;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {Array.from({ length: chevrons }, (_, i) => (
        <Piece key={`c${i}`} i={i} sweep={sweep} count={count}>
          <View style={{ transform: [{ rotate: '180deg' }], marginRight: i === chevrons - 1 ? 8 : -5 }}>
            <ChevronRight size={14} color="#ffffff" />
          </View>
        </Piece>
      ))}
      {chars.map((c, i) => (
        <Piece key={i} i={chevrons + i} sweep={sweep} count={count}>
          <Animated.Text style={style}>{c === ' ' ? ' ' : c}</Animated.Text>
        </Piece>
      ))}
    </View>
  );
}
