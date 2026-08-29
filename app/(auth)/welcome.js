import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { useAuth } from '../../context/AuthContext';
import { SuccessBadge } from '../../components/SuccessBadge';

// Shared "settle" ease-out-expo feel used for every reveal in this flow —
// keeps the whole sequence reading as one calm motion language rather than
// a pile of one-off effects.
const SETTLE_EASING = Easing.bezier(0.16, 1, 0.3, 1);

const ITEM_DURATION_MS = 650;
const HOLD_MS = 6000; // dwell time on a popup/reveal page before auto-advancing

function FadeIn({ delay, duration = ITEM_DURATION_MS, distance = 14, style, children }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration, easing: SETTLE_EASING }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * distance }],
  }));

  return <Animated.View style={[style, aStyle]}>{children}</Animated.View>;
}

function WelcomeGreetingPage({ name, onDone }) {
  const helloProgress = useSharedValue(0);
  const titleProgress = useSharedValue(0);

  useEffect(() => {
    helloProgress.value = withDelay(200, withTiming(1, { duration: 550, easing: SETTLE_EASING }));
    titleProgress.value = withDelay(1200, withTiming(1, { duration: 550, easing: SETTLE_EASING }));

    const t = setTimeout(onDone, HOLD_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const helloStyle = useAnimatedStyle(() => ({
    opacity: helloProgress.value,
    transform: [{ translateY: (1 - helloProgress.value) * 10 }],
  }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleProgress.value,
    transform: [{ translateY: (1 - titleProgress.value) * 10 }],
  }));

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
      <Animated.Text style={[{ color: '#ffffff', fontSize: 20, fontWeight: '500', marginBottom: 8 }, helloStyle]}>
        Hello <Text style={{ color: '#4ade80', fontWeight: '700' }}>{name}</Text>👋
      </Animated.Text>
      <Animated.Text style={[{ color: '#ffffff', fontSize: 24, fontWeight: '700' }, titleStyle]}>
        Welcome to Okana
      </Animated.Text>
    </View>
  );
}

// Confirms the trial that grant_free_trial_on_signup already started
// server-side the instant the account was created — nothing happens here on
// press, this is purely informational. Gets the success ding (see
// SuccessBadge's playSound) since it's the one moment that replaced the old
// "account created" celebration removed earlier.
function TrialStartedPage({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, HOLD_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
      <SuccessBadge style={{ marginBottom: 22 }} playSound />
      <FadeIn delay={500} distance={20}>
        <Text style={{ color: '#ffffff', fontSize: 19, fontWeight: '700', textAlign: 'center' }}>
          You're all set
        </Text>
      </FadeIn>
      <FadeIn delay={900} distance={20}>
        <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15, marginTop: 8, textAlign: 'center' }}>
          You have full access to Okana Plus for the next 30 days — no card required
        </Text>
      </FadeIn>
    </View>
  );
}

// Simple one-by-one reveal, same as the rest of the flow — coin, then each
// quote line, then the CTA. No hold/fade-out drama on the coin itself.
const INTRO_STAGGER_MS = 900;

function IntroQuotePage({ onFinish }) {
  const coin = useSharedValue(0);
  const line1 = useSharedValue(0);
  const line2 = useSharedValue(0);
  const line3 = useSharedValue(0);
  const button = useSharedValue(0);

  useEffect(() => {
    coin.value = withTiming(1, { duration: 550, easing: SETTLE_EASING });
    line1.value = withDelay(INTRO_STAGGER_MS, withTiming(1, { duration: 550, easing: SETTLE_EASING }));
    line2.value = withDelay(INTRO_STAGGER_MS * 2, withTiming(1, { duration: 550, easing: SETTLE_EASING }));
    line3.value = withDelay(INTRO_STAGGER_MS * 3, withTiming(1, { duration: 550, easing: SETTLE_EASING }));
    button.value = withDelay(INTRO_STAGGER_MS * 4, withTiming(1, { duration: 500, easing: SETTLE_EASING }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const coinStyle = useAnimatedStyle(() => ({
    opacity: coin.value,
    transform: [{ scale: 0.85 + coin.value * 0.15 }],
  }));
  const line1Style = useAnimatedStyle(() => ({ opacity: line1.value, transform: [{ translateY: (1 - line1.value) * 10 }] }));
  const line2Style = useAnimatedStyle(() => ({ opacity: line2.value, transform: [{ translateY: (1 - line2.value) * 10 }] }));
  const line3Style = useAnimatedStyle(() => ({ opacity: line3.value, transform: [{ translateY: (1 - line3.value) * 10 }] }));
  const buttonStyle = useAnimatedStyle(() => ({
    opacity: button.value,
    transform: [{ translateY: (1 - button.value) * 14 }],
  }));

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
      <Animated.Image
        source={require('../../assets/coin.png')}
        style={[{ width: 72, height: 72, marginBottom: 28 }, coinStyle]}
        resizeMode="contain"
      />
      <Animated.Text style={[{ color: '#ffffff', fontSize: 17, fontWeight: '600', textAlign: 'center' }, line1Style]}>
        Small amounts add up
      </Animated.Text>
      <Animated.Text style={[{ color: '#4ade80', fontSize: 15, fontWeight: '700', textAlign: 'center', marginTop: 10, letterSpacing: 0.5 }, line2Style]}>
        TRACK EVERY RUPEE YOU SPEND
      </Animated.Text>
      <Animated.Text style={[{ color: 'rgba(255,255,255,0.45)', fontSize: 14, textAlign: 'center', marginTop: 8 }, line3Style]}>
        Track it, Analyse it
      </Animated.Text>

      <Animated.View style={[{ width: '100%', marginTop: 36 }, buttonStyle]}>
        <Pressable
          onPress={onFinish}
          style={{ width: '100%', paddingVertical: 16, borderRadius: 16, alignItems: 'center', backgroundColor: '#ffffff' }}
        >
          <Text style={{ color: '#000000', fontSize: 16, fontWeight: '600' }}>Start Tracking</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const STEPS = ['welcome', 'trial-started', 'intro'];

// Set only once the carousel is actually finished (not on mount, unlike
// onboarding.js's pre-signup ONBOARDING_SEEN_KEY) — app/index.js redirects
// back here on every cold launch until this is set, so closing the app
// mid-carousel (e.g. right after a failed trial purchase) picks the whole
// sequence back up from the start next time instead of silently dropping
// the user onto Home having skipped the trial-purchase step entirely.
export function welcomeSeenKey(userId) {
  return `okana_welcome_seen_${userId}`;
}

export default function WelcomeScreen() {
  const router = useRouter();
  const { profile, user } = useAuth();
  const [step, setStep] = useState(STEPS[0]);
  const firstName = (profile?.name || 'there').split(' ')[0];

  function next() {
    setStep(s => {
      const i = STEPS.indexOf(s);
      return STEPS[i + 1] ?? s;
    });
  }

  function finish() {
    if (user) AsyncStorage.setItem(welcomeSeenKey(user.id), '1');
    router.replace('/(app)');
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      {step === 'welcome' && <WelcomeGreetingPage name={firstName} onDone={next} />}

      {step === 'trial-started' && <TrialStartedPage onDone={next} />}

      {step === 'intro' && <IntroQuotePage onFinish={finish} />}
    </View>
  );
}
