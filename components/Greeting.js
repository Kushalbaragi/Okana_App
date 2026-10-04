import { useEffect } from 'react';
import { View, Text } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { darkText } from '../utils/colors';
import { SETTLE_EASING } from '../utils/motion';
import { FONT } from '../utils/type';

// The greeting page: one line, "Welcome back," in grey and the name in white,
// the same size as a slide title, resting on a hairline that fades out at both
// ends. The line arrives after the words.
const LINE_SIDE = 28;
// The gap between the line and the words resting on it.
const WORDS_GAP = 20;

function useReveal(delay, duration = 600) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration, easing: SETTLE_EASING }));
  }, [delay, duration, progress]);
  return progress;
}

export default function Greeting({ label, name }) {
  const wordsProgress = useReveal(200);
  const lineProgress = useReveal(650, 800);

  const wordsStyle = useAnimatedStyle(() => ({ opacity: wordsProgress.value, transform: [{ translateY: (1 - wordsProgress.value) * 8 }] }));
  // Draws outward from the middle.
  const lineStyle = useAnimatedStyle(() => ({ opacity: lineProgress.value, transform: [{ scaleX: lineProgress.value }] }));

  return (
    // The line is the middle of the screen, both ways; the words sit on it.
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <Animated.View style={[{ height: 1, marginHorizontal: LINE_SIDE }, lineStyle]}>
        <Svg width="100%" height={1}>
          <Defs>
            <LinearGradient id="horizon" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#ffffff" stopOpacity={0} />
              <Stop offset="0.5" stopColor="#ffffff" stopOpacity={0.45} />
              <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height={1} fill="url(#horizon)" />
        </Svg>
      </Animated.View>
      <Animated.Text
        numberOfLines={1}
        style={[{ position: 'absolute', left: 0, right: 0, top: '50%', marginTop: -(WORDS_GAP + 28), fontSize: FONT.title, lineHeight: 28, textAlign: 'center', paddingHorizontal: LINE_SIDE }, wordsStyle]}
      >
        <Text style={{ fontWeight: '400', color: darkText.secondary }}>{label}, </Text>
        <Text style={{ fontWeight: '600', color: '#ffffff' }}>{name}</Text>
      </Animated.Text>
    </View>
  );
}
