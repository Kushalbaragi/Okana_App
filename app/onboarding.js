import { useEffect, useState } from 'react';
import { View, Text, Image } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';

export const ONBOARDING_SEEN_KEY = 'okana_onboarding_seen';

// Each of the two pages runs fade-in -> hold -> fade-out, totalling exactly
// 4s before advancing — matches the requested "4 sec before showing next
// page" pacing.
const FADE_IN_MS = 550;
const HOLD_MS = 2900;
const FADE_OUT_MS = 550;
const PAGE_DURATION_MS = FADE_IN_MS + HOLD_MS + FADE_OUT_MS;

function CoinPage({ active }) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (!active) return;
    // One withSequence, not two separate `.value =` assignments — a shared
    // value's second assignment cancels the first outright rather than
    // queuing it, so the fade-in would never actually complete otherwise.
    opacity.value = withSequence(
      withTiming(1, { duration: FADE_IN_MS, easing: Easing.out(Easing.cubic) }),
      withDelay(HOLD_MS, withTiming(0, { duration: FADE_OUT_MS, easing: Easing.in(Easing.cubic) })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[{ flex: 1, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Image source={require('../assets/coin.png')} style={{ width: 72, height: 72 }} resizeMode="contain" />
    </Animated.View>
  );
}

function QuotePage({ active }) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (!active) return;
    opacity.value = withSequence(
      withTiming(1, { duration: FADE_IN_MS, easing: Easing.out(Easing.cubic) }),
      withDelay(HOLD_MS, withTiming(0, { duration: FADE_OUT_MS, easing: Easing.in(Easing.cubic) })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 48 }, style]}>
      <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 17, textAlign: 'center', lineHeight: 25 }}>
        “You can't see your <Text style={{ color: '#4ade80' }}>progress</Text>{'\n'}if you dont track it”
      </Text>
    </Animated.View>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);

  useEffect(() => {
    // Recorded once, on first view, not on tapping through — an onboarding
    // sequence this deliberately slow shouldn't replay in full every time
    // someone reopens the app after getting interrupted mid-sequence.
    AsyncStorage.setItem(ONBOARDING_SEEN_KEY, '1');
  }, []);

  useEffect(() => {
    // Both pages auto-advance after their fade-in/hold/fade-out cycle; the
    // second one hands off straight to login instead of a third "tap to
    // continue" page.
    const t = setTimeout(() => {
      if (page === 0) setPage(1);
      else router.push('/(auth)/login');
    }, PAGE_DURATION_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      {page === 0 && <CoinPage active={page === 0} />}
      {page === 1 && <QuotePage active={page === 1} />}

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
