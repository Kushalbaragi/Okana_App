import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import SlideStack, { SLIDE_EASING, SLIDE_MS } from '../components/SlideStack';
import ShimmerText from '../components/ShimmerText';
import { WELCOME_SLIDES } from '../components/WelcomeSlides';
import { reportError } from '../utils/errors';
import { GUTTER } from '../utils/spacing';
import { FONT } from '../utils/type';

export const ONBOARDING_SEEN_KEY = 'okana_onboarding_seen';

// The same background as the subscription page.
const BACKGROUND = require('../assets/subscription-bg.webp');
const BACKGROUND_OPACITY = 0.35;

const LAST = WELCOME_SLIDES.length - 1;
const HEADER_HEIGHT = 36;
// The row at the top the titles sit under, and the footer's own parts.
const TITLE_GAP = 56;
const DOT = 5;
const BUTTON_HEIGHT = 48;
const FOOTER_BOTTOM = 28;
const HINT_GAP = 24;
const HINT_HEIGHT = 20;

// What a first-time visitor sees, before sign-in: a handful of slides to swipe
// through, then "Get started" into the email screen. The first slide says to
// swipe; there is no way to skip ahead, so the price on the last is always seen.
export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const lastProgress = useSharedValue(0);
  const firstProgress = useSharedValue(1);
  // A tap on the hint while a slide is still moving is ignored, so the
  // page never jumps mid-transition.
  const busyUntil = useRef(0);

  useEffect(() => {
    const opts = { duration: SLIDE_MS, easing: SLIDE_EASING };
    lastProgress.value = withTiming(index === LAST ? 1 : 0, opts);
    firstProgress.value = withTiming(index === 0 ? 1 : 0, opts);
  }, [index, lastProgress, firstProgress]);

  function goTo(next) {
    const now = Date.now();
    if (now < busyUntil.current) return;
    busyUntil.current = now + SLIDE_MS;
    setIndex(next);
  }

  function finish() {
    // Recorded once the slides have been gone through; if this can't be saved
    // they just show again next launch.
    AsyncStorage.setItem(ONBOARDING_SEEN_KEY, '1').catch(reportError);
    router.push('/(auth)/login');
  }

  const top = insets.top + 12 + HEADER_HEIGHT + TITLE_GAP;
  // Held the same on every slide, so the titles and what is under them line up.
  const bottom = insets.bottom + FOOTER_BOTTOM + DOT + HINT_GAP + HINT_HEIGHT + 16;

  const fadeOutAtEnd = useAnimatedStyle(() => ({ opacity: interpolate(lastProgress.value, [0, 1], [1, 0]) }));
  const fadeInAtEnd = useAnimatedStyle(() => ({ opacity: lastProgress.value }));
  const hintStyle = useAnimatedStyle(() => ({ opacity: firstProgress.value }));

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      <Image source={BACKGROUND} contentFit="cover" pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: BACKGROUND_OPACITY }]} />

      <SlideStack index={index} onIndexChange={setIndex}>
        {WELCOME_SLIDES.map(({ key, Component }) => (
          <Component key={key} top={top} bottom={bottom} />
        ))}
      </SlideStack>

      {/* The first slide's one instruction. */}
      <Animated.View
        pointerEvents={index === 0 ? 'auto' : 'none'}
        style={[{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + FOOTER_BOTTOM + DOT + HINT_GAP, height: HINT_HEIGHT, alignItems: 'center' }, hintStyle]}
      >
        <Pressable onPress={() => goTo(1)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Swipe to continue">
          <ShimmerText chevrons={2} style={{ fontSize: FONT.caption, color: "#ffffff" }}>Swipe to continue</ShimmerText>
        </Pressable>
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + FOOTER_BOTTOM, flexDirection: 'row', justifyContent: 'center', gap: 7, height: DOT }, fadeOutAtEnd]}
      >
        {WELCOME_SLIDES.map(({ key }, i) => (
          <View key={key} style={{ width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: i === index ? '#ffffff' : 'rgba(255,255,255,0.25)' }} />
        ))}
      </Animated.View>

      {/* Only on the last slide: the way on. */}
      <Animated.View
        pointerEvents={index === LAST ? 'auto' : 'none'}
        style={[{ position: 'absolute', left: GUTTER, right: GUTTER, bottom: insets.bottom + FOOTER_BOTTOM }, fadeInAtEnd]}
      >
        <Pressable onPress={finish} accessibilityRole="button" style={{ height: BUTTON_HEIGHT, borderRadius: 9999, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: FONT.body, fontWeight: '500', color: '#000000' }}>Get started</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}
