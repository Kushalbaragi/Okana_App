import { useEffect, useState } from 'react';
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
// in the app (SummaryCard's AnimatedAmount) — reused here so the button
// reveal on the final page reads as part of the same motion language.
const SETTLE_EASING = Easing.bezier(0.16, 1, 0.3, 1);

// Each of the first two pages runs fade-in -> hold -> fade-out, totalling
// exactly 4s before advancing — matches the requested "4 sec before showing
// next page" pacing.
const FADE_IN_MS = 550;
const HOLD_MS = 2900;
const FADE_OUT_MS = 550;
const PAGE_DURATION_MS = FADE_IN_MS + HOLD_MS + FADE_OUT_MS;

const BUTTON_STAGGER_MS = 200;
const BUTTON_DURATION_MS = 480;

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

function WelcomePage({ active, onCreateAccount, onLogin }) {
  const titleProgress = useSharedValue(0);
  const createProgress = useSharedValue(0);
  const loginProgress = useSharedValue(0);

  useEffect(() => {
    if (!active) return;
    titleProgress.value = withTiming(1, { duration: 550, easing: Easing.out(Easing.cubic) });
    createProgress.value = withDelay(250, withTiming(1, { duration: BUTTON_DURATION_MS, easing: SETTLE_EASING }));
    loginProgress.value = withDelay(250 + BUTTON_STAGGER_MS, withTiming(1, { duration: BUTTON_DURATION_MS, easing: SETTLE_EASING }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleProgress.value,
    transform: [{ translateY: (1 - titleProgress.value) * 12 }],
  }));
  const createStyle = useAnimatedStyle(() => ({
    opacity: createProgress.value,
    transform: [{ translateY: (1 - createProgress.value) * 16 }],
  }));
  const loginStyle = useAnimatedStyle(() => ({
    opacity: loginProgress.value,
    transform: [{ translateY: (1 - loginProgress.value) * 16 }],
  }));

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
      <Animated.Text style={[{ color: '#ffffff', fontSize: 22, fontWeight: '700', marginBottom: 28 }, titleStyle]}>
        Welcome to Okana
      </Animated.Text>

      <View style={{ width: 300, gap: 12 }}>
        <Animated.View style={[{ alignSelf: 'stretch' }, createStyle]}>
          <Pressable
            onPress={onCreateAccount}
            style={{ width: '100%', paddingVertical: 15, borderRadius: 16, alignItems: 'center', backgroundColor: '#ffffff' }}
          >
            <Text style={{ color: '#000000', fontSize: 16, fontWeight: '600' }}>Create Account</Text>
          </Pressable>
        </Animated.View>

        <Animated.View style={[{ alignSelf: 'stretch' }, loginStyle]}>
          <Pressable
            onPress={onLogin}
            style={{ width: '100%', paddingVertical: 15, borderRadius: 16, alignItems: 'center', backgroundColor: '#242424' }}
          >
            <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '600' }}>Login</Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
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
    // Pages 1 and 2 auto-advance after their fade-in/hold/fade-out cycle;
    // the final page waits for the user to tap Create Account or Login.
    if (page >= 2) return;
    const t = setTimeout(() => setPage(p => p + 1), PAGE_DURATION_MS);
    return () => clearTimeout(t);
  }, [page]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      {page === 0 && <CoinPage active={page === 0} />}
      {page === 1 && <QuotePage active={page === 1} />}
      {page === 2 && (
        <WelcomePage
          active={page === 2}
          onCreateAccount={() => router.push('/(auth)/signup')}
          onLogin={() => router.push('/(auth)/login')}
        />
      )}

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
