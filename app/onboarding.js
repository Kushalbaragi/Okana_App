import { useEffect } from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  Easing,
} from 'react-native-reanimated';

export const ONBOARDING_SEEN_KEY = 'okana_onboarding_seen';

// Same ease-out-expo "settle" feel used for digit/amount reveals elsewhere
// in the app (SummaryCard's AnimatedAmount) — reused here so the letter
// reveal reads as part of the same motion language, not a one-off effect.
const SETTLE_EASING = Easing.bezier(0.16, 1, 0.3, 1);

// Absolute-time choreography (ms from mount) — kept as named constants
// rather than inline magic numbers so the whole sequence reads top-to-bottom
// as one timeline.
const COIN_FADE_IN_MS     = 900;
const COIN_HOLD_MS        = 3000;
const COIN_FADE_OUT_MS    = 900;
const COIN_FADE_OUT_START = COIN_FADE_IN_MS + COIN_HOLD_MS;
const TITLE_START         = COIN_FADE_OUT_START + COIN_FADE_OUT_MS + 200;
const LETTER_STAGGER_MS   = 90;
const LETTER_DURATION_MS  = 450;
const TITLE_TEXT          = 'OKANA';
const TITLE_END           = TITLE_START + (TITLE_TEXT.length - 1) * LETTER_STAGGER_MS + LETTER_DURATION_MS;
const TAGLINE_START       = TITLE_END + 150;
const TAGLINE_DURATION_MS = 700;
const BUTTONS_START       = TAGLINE_START + TAGLINE_DURATION_MS + 2000;
const BUTTON_STAGGER_MS   = 220;
const BUTTON_DURATION_MS  = 500;

function Letter({ char, delay }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration: LETTER_DURATION_MS, easing: SETTLE_EASING }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 14 }],
  }));

  return (
    <Animated.Text
      style={[{ fontSize: 40, fontWeight: '700', color: '#ffffff', letterSpacing: 1 }, style]}
    >
      {char}
    </Animated.Text>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const coinOpacity = useSharedValue(0);
  const coinScale = useSharedValue(1);
  const coinRotate = useSharedValue(0);
  const taglineProgress = useSharedValue(0);
  const groupShiftY = useSharedValue(0);
  const createProgress = useSharedValue(0);
  const loginProgress = useSharedValue(0);

  useEffect(() => {
    // Recorded once, on first view, not on tapping through — an onboarding
    // sequence this deliberately slow shouldn't replay in full every time
    // someone reopens the app after getting interrupted mid-animation.
    AsyncStorage.setItem(ONBOARDING_SEEN_KEY, '1');

    // Fade-in and fade-out must be one withSequence, not two separate
    // `.value =` assignments — a shared value's second assignment replaces
    // the first outright (Reanimated doesn't queue them), so the fade-in
    // here was being cancelled before it ever ran and the coin never
    // actually became visible.
    coinOpacity.value = withSequence(
      withTiming(1, { duration: COIN_FADE_IN_MS, easing: Easing.out(Easing.cubic) }),
      withDelay(COIN_HOLD_MS, withTiming(0, { duration: COIN_FADE_OUT_MS, easing: Easing.in(Easing.cubic) })),
    );
    coinScale.value = withDelay(COIN_FADE_OUT_START, withTiming(0.72, { duration: COIN_FADE_OUT_MS, easing: Easing.in(Easing.cubic) }));
    coinRotate.value = withDelay(COIN_FADE_OUT_START, withTiming(150, { duration: COIN_FADE_OUT_MS, easing: Easing.inOut(Easing.cubic) }));

    taglineProgress.value = withDelay(TAGLINE_START, withTiming(1, { duration: TAGLINE_DURATION_MS, easing: Easing.out(Easing.cubic) }));
    groupShiftY.value = withDelay(TAGLINE_START, withTiming(-18, { duration: TAGLINE_DURATION_MS, easing: Easing.out(Easing.cubic) }));

    createProgress.value = withDelay(BUTTONS_START, withTiming(1, { duration: BUTTON_DURATION_MS, easing: SETTLE_EASING }));
    loginProgress.value = withDelay(BUTTONS_START + BUTTON_STAGGER_MS, withTiming(1, { duration: BUTTON_DURATION_MS, easing: SETTLE_EASING }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const coinStyle = useAnimatedStyle(() => ({
    opacity: coinOpacity.value,
    transform: [{ scale: coinScale.value }, { rotate: `${coinRotate.value}deg` }],
  }));

  const taglineStyle = useAnimatedStyle(() => ({
    opacity: taglineProgress.value,
    transform: [{ translateY: (1 - taglineProgress.value) * 10 }],
  }));

  const groupStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: groupShiftY.value }],
  }));

  const createStyle = useAnimatedStyle(() => ({
    opacity: createProgress.value,
    transform: [{ translateY: (1 - createProgress.value) * 20 }],
  }));

  const loginStyle = useAnimatedStyle(() => ({
    opacity: loginProgress.value,
    transform: [{ translateY: (1 - loginProgress.value) * 20 }],
  }));

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      {/* Coin — absolutely centered, fades/rotates/shrinks away entirely
          before the title starts revealing, so the two never overlap. */}
      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }, coinStyle]}
      >
        <Image source={require('../assets/coin.png')} style={{ width: 200, height: 200 }} resizeMode="contain" />
      </Animated.View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <Animated.View style={[{ alignItems: 'center' }, groupStyle]}>
          <View style={{ flexDirection: 'row' }}>
            {[...TITLE_TEXT].map((char, i) => (
              <Letter key={i} char={char} delay={TITLE_START + i * LETTER_STAGGER_MS} />
            ))}
          </View>

          <Animated.Text
            style={[{ color: 'rgba(255,255,255,0.45)', fontSize: 15, marginTop: 10, letterSpacing: 0.2 }, taglineStyle]}
          >
            Every rupee matters.
          </Animated.Text>

          {/* Full-width button block deliberately lives outside the
              shrink-wrapped title/tagline group (which sizes to its
              content, not the screen) — a nested width:'100%' inside that
              group has no real ancestor width to resolve against, so the
              buttons ended up hugging their own text instead of filling the
              row. By the time these appear (well after the group's own
              shift finishes), it makes no visual difference that they're a
              sibling instead of a child. */}
          <View style={{ width: 300, marginTop: 44, gap: 12 }}>
            <Animated.View style={[{ alignSelf: 'stretch' }, createStyle]}>
              <Pressable
                onPress={() => router.push('/(auth)/signup')}
                style={{ width: '100%', paddingVertical: 15, borderRadius: 16, alignItems: 'center', backgroundColor: '#ffffff' }}
              >
                <Text style={{ color: '#000000', fontSize: 16, fontWeight: '600' }}>Create account</Text>
              </Pressable>
            </Animated.View>

            <Animated.View style={[{ alignSelf: 'stretch' }, loginStyle]}>
              <Pressable
                onPress={() => router.push('/(auth)/login')}
                style={{ width: '100%', paddingVertical: 15, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' }}
              >
                <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '600' }}>Log in</Text>
              </Pressable>
            </Animated.View>
          </View>
        </Animated.View>
      </View>

      <Text
        style={{
          position: 'absolute', bottom: insets.bottom + 20, left: 0, right: 0,
          textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 13,
        }}
      >
        Built with ♥ by Kushal
      </Text>
    </View>
  );
}
