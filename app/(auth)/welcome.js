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
import { PRICE_PER_YEAR } from '../../utils/trial';
import { CheckIcon } from '../../components/icons';
import { SuccessBadge } from '../../components/SuccessBadge';

// Shared "settle" ease-out-expo feel used for every reveal in this flow —
// keeps the whole sequence reading as one calm motion language rather than
// a pile of one-off effects.
const SETTLE_EASING = Easing.bezier(0.16, 1, 0.3, 1);

const ITEM_STAGGER_MS = 1000;
const ITEM_DURATION_MS = 650;
const HOLD_MS = 6000; // dwell time on a popup/reveal page before auto-advancing

// Exported — subscription.js reuses this exact content for its pre-conversion
// pitch, rather than keeping a second copy that could drift out of sync.
export const WHY_ITEMS = [
  { title: 'Keeping it simple', description: 'No distractions, unnecessary features, or colourful clutter. Just what you need to track your money.' },
  { title: 'Built for consistency', description: 'I removed as much friction as possible, so you can keep tracking without giving up after a week.' },
  { title: 'Make tracking a habit', description: 'Just add your income and expenses every day. Okana takes care of the rest.' },
  { title: 'Track every rupee', description: 'Every rupee matters. The more you track, the better you understand your money.' },
  { title: 'Spend with awareness', description: 'Set a budget, watch your spending calendar, and try to create more green days.' },
];

const TRIAL_ITEMS = [
  { title: '30 days, completely free', description: "You'll have full access to Okana Plus for 30 days, starting today." },
  { title: 'No payment info needed', description: "We won't ask for any payment details to start your trial." },
  { title: `Then ₹${PRICE_PER_YEAR}/year`, description: "If you'd like to keep Okana Plus after your trial, you can subscribe anytime." },
  { title: 'No surprise charges', description: "Nothing is billed automatically — you choose if and when to subscribe." },
  { title: 'Secure and Trusted', description: 'Your data stays private and is never shared.' },
];

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

function ChecklistItem({ title, description, delay }) {
  return (
    <FadeIn delay={delay} style={{ marginBottom: 32 }}>
      <View className="flex-row items-center" style={{ gap: 10 }}>
        <CheckIcon size={20} />
        <Text style={{ color: '#ffffff', fontSize: 17, fontWeight: '600' }}>{title}</Text>
      </View>
      <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 15.5, lineHeight: 22, marginTop: 5, marginLeft: 30 }}>
        {description}
      </Text>
    </FadeIn>
  );
}

// Shared layout for "Why Okana" and "Take your time" — same one-by-one
// reveal, same trailing CTA, differing only in copy and button color.
function ChecklistPage({ title, items, buttonLabel, buttonColor, buttonTextColor, onContinue }) {
  const buttonDelay = 400 + items.length * ITEM_STAGGER_MS;

  return (
    <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 100, paddingBottom: 40 }}>
      <FadeIn delay={0} duration={500} distance={10} style={{ marginBottom: 38 }}>
        <Text style={{ color: '#ffffff', fontSize: 30, fontWeight: '700', textAlign: 'center' }}>{title}</Text>
      </FadeIn>

      <View style={{ flex: 1 }}>
        {items.map((item, i) => (
          <ChecklistItem key={item.title} title={item.title} description={item.description} delay={400 + i * ITEM_STAGGER_MS} />
        ))}
      </View>

      <FadeIn delay={buttonDelay} duration={500}>
        <Pressable
          onPress={onContinue}
          style={{ width: '100%', paddingVertical: 16, borderRadius: 16, alignItems: 'center', backgroundColor: buttonColor }}
        >
          <Text style={{ color: buttonTextColor, fontSize: 16, fontWeight: '600' }}>{buttonLabel}</Text>
        </Pressable>
      </FadeIn>
    </View>
  );
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
          Your free trial has started
        </Text>
      </FadeIn>
      <FadeIn delay={900} distance={20}>
        <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15, marginTop: 8, textAlign: 'center' }}>
          You have full access to Okana Plus for the next 30 days
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
        Remember - Every rupee matters
      </Animated.Text>
      <Animated.Text style={[{ color: 'rgba(255,255,255,0.55)', fontSize: 15, textAlign: 'center', marginTop: 10 }, line2Style]}>
        You will not live once, You live everyday
      </Animated.Text>
      <Animated.Text style={[{ color: '#4ade80', fontSize: 15, fontWeight: '600', textAlign: 'center', marginTop: 10 }, line3Style]}>
        Spend your rupee wisely
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

const STEPS = ['welcome', 'why', 'trial-info', 'trial-started', 'intro'];

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

      {step === 'why' && (
        <ChecklistPage
          title="Why Okana"
          items={WHY_ITEMS}
          buttonLabel="Next"
          buttonColor="#ffffff"
          buttonTextColor="#000000"
          onContinue={next}
        />
      )}

      {step === 'trial-info' && (
        <ChecklistPage
          title="Take your time"
          items={TRIAL_ITEMS}
          buttonLabel="Continue"
          buttonColor="#22c55e"
          buttonTextColor="#ffffff"
          onContinue={next}
        />
      )}

      {step === 'trial-started' && <TrialStartedPage onDone={next} />}

      {step === 'intro' && <IntroQuotePage onFinish={finish} />}
    </View>
  );
}
