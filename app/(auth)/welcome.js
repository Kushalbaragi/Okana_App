import { useEffect, useState } from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { useAudioPlayer } from 'expo-audio';
import { useAuth } from '../../context/AuthContext';
import { darkText } from '../../utils/colors';
import { SuccessBadge } from '../../components/SuccessBadge';
import { ChevronRight } from '../../components/icons';
import { reportError } from '../../utils/errors';
import { SETTLE_EASING } from '../../utils/motion';

const SUCCESS_SOUND = require('../../assets/sounds/success.wav');

// Shared "settle" ease-out-expo feel used for every reveal in this flow —
// keeps the whole sequence reading as one calm motion language rather than
// a pile of one-off effects.

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
      <Animated.Text style={[{ color: '#ffffff', fontSize: 17, fontWeight: '400', marginBottom: 8 }, helloStyle]}>
        Hello <Text style={{ color: '#4ade80', fontWeight: '600' }}>{name}</Text>👋
      </Animated.Text>
      <Animated.Text style={[{ color: '#ffffff', fontSize: 21, fontWeight: '500' }, titleStyle]}>
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
function TrialStartedPage({ onDone, soundPlayer }) {
  useEffect(() => {
    const t = setTimeout(onDone, HOLD_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
      <SuccessBadge style={{ marginBottom: 22 }} playSound player={soundPlayer} />
      <FadeIn delay={500} distance={20}>
        <Text style={{ color: '#ffffff', fontSize: 19, fontWeight: '700', textAlign: 'center' }}>
          You're all set
        </Text>
      </FadeIn>
      <FadeIn delay={900} distance={20}>
        <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15, marginTop: 8, textAlign: 'center' }}>
          Okana Plus — Free for 30 days.{'\n'}No payment required.
        </Text>
      </FadeIn>
    </View>
  );
}

// Simple one-by-one reveal, same as the rest of the flow — coin, then each
// quote line, then the CTA. No hold/fade-out drama on the coin itself.
const INTRO_STAGGER_MS = 900;

// How long the coin's own entrance takes before its continuous pulse
// (below) takes over — kept short, and with plenty of room before
// INTRO_STAGGER_MS (when the first line starts), so the coin has clearly
// already arrived rather than still easing in alongside the first line.
const COIN_ENTER_MS = 300;

function IntroQuotePage({ onFinish }) {
  const coin = useSharedValue(0);
  // Separate from `coin` (the one-shot entrance) so the breathing loop
  // below can multiply on top of it without fighting over the same value —
  // stays at 1 (no-op) until the entrance settles, then gently oscillates.
  const coinPulse = useSharedValue(1);
  const line1 = useSharedValue(0);
  const line2 = useSharedValue(0);
  const line3 = useSharedValue(0);
  const button = useSharedValue(0);
  const arrowX = useSharedValue(0);

  useEffect(() => {
    coin.value = withTiming(1, { duration: COIN_ENTER_MS, easing: SETTLE_EASING });
    coinPulse.value = withDelay(
      COIN_ENTER_MS,
      withRepeat(withTiming(1.08, { duration: 900, easing: SETTLE_EASING }), -1, true),
    );
    line1.value = withDelay(INTRO_STAGGER_MS, withTiming(1, { duration: 550, easing: SETTLE_EASING }));
    line2.value = withDelay(INTRO_STAGGER_MS * 2, withTiming(1, { duration: 550, easing: SETTLE_EASING }));
    line3.value = withDelay(INTRO_STAGGER_MS * 3, withTiming(1, { duration: 550, easing: SETTLE_EASING }));
    button.value = withDelay(INTRO_STAGGER_MS * 4, withTiming(1, { duration: 500, easing: SETTLE_EASING }));
    // A small back-and-forth nudge on the arrow — a "this is tappable, go
    // this way" cue instead of the button leaning on a big filled pill to
    // draw the eye. Starts once the button itself has finished settling in.
    arrowX.value = withDelay(
      INTRO_STAGGER_MS * 4 + 500,
      withRepeat(withSequence(
        withTiming(6, { duration: 500, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 500, easing: Easing.inOut(Easing.quad) }),
      ), -1, false),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const coinStyle = useAnimatedStyle(() => ({
    opacity: coin.value,
    transform: [{ scale: (0.85 + coin.value * 0.15) * coinPulse.value }],
  }));
  const line1Style = useAnimatedStyle(() => ({ opacity: line1.value, transform: [{ translateY: (1 - line1.value) * 10 }] }));
  const line2Style = useAnimatedStyle(() => ({ opacity: line2.value, transform: [{ translateY: (1 - line2.value) * 10 }] }));
  const line3Style = useAnimatedStyle(() => ({ opacity: line3.value, transform: [{ translateY: (1 - line3.value) * 10 }] }));
  const buttonStyle = useAnimatedStyle(() => ({
    opacity: button.value,
    transform: [{ translateY: (1 - button.value) * 14 }],
  }));
  const arrowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: arrowX.value }] }));

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
      <Animated.Image
        source={require('../../assets/coin.png')}
        style={[{ width: 56, height: 56, marginBottom: 28 }, coinStyle]}
        resizeMode="contain"
      />
      {/* Eyebrow → headline → caption, in that visual order (still fades in
          top-to-bottom via line1/line2/line3, same as before) — previously
          the small, bold, all-caps green line sat *below* the plain
          headline and out-shouted it despite being the smaller of the two,
          which read as a mismatched hierarchy rather than an intentional
          one. */}
      <Animated.Text style={[{ color: '#4ade80', fontSize: 13, fontWeight: '700', textAlign: 'center', letterSpacing: 1 }, line1Style]}>
        TRACK EVERY RUPEE YOU SPEND
      </Animated.Text>
      <Animated.Text style={[{ color: '#ffffff', fontSize: 24, fontWeight: '700', textAlign: 'center', marginTop: 10 }, line2Style]}>
        Small amounts add up
      </Animated.Text>
      <Animated.Text style={[{ color: darkText.tertiary, fontSize: 14, textAlign: 'center', marginTop: 8 }, line3Style]}>
        Track it, Analyse it
      </Animated.Text>

      {/* Text + arrow, not a filled pill — a solid white block this size was
          the loudest thing on the page by far, pulling focus away from the
          quote above it that the whole reveal sequence builds up to. */}
      <Animated.View style={[{ marginTop: 36 }, buttonStyle]}>
        <Pressable
          onPress={onFinish}
          hitSlop={12}
          className="flex-row items-center"
          style={{ gap: 6, paddingVertical: 12, paddingHorizontal: 8 }}
        >
          {/* Text and icon pinned to the same explicit box height (20),
              icon content centered within its own via justifyContent —
              `items-center` alone lines up the two boxes, but a Text's
              box carries extra font-metric space (ascender/descender)
              a tightly-bound SVG icon doesn't, so their glyphs still read
              as off-center from each other even with matching boxes. */}
          <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '600', lineHeight: 20 }}>Start Tracking</Text>
          <Animated.View style={[{ height: 20, justifyContent: 'center', marginTop: 2 }, arrowStyle]}>
            <ChevronRight size={16} color="#ffffff" />
          </Animated.View>
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
  // Created here (mounted well before 'trial-started' is ever reached, not
  // inside TrialStartedPage itself) so the sound asset has the whole
  // 'welcome' step's worth of time to actually finish loading before it's
  // played — see the comment on SuccessBadge's `player` prop.
  const trialSound = useAudioPlayer(SUCCESS_SOUND);

  function next() {
    setStep(s => {
      const i = STEPS.indexOf(s);
      return STEPS[i + 1] ?? s;
    });
  }

  function finish() {
    // If this can't be saved, the welcome carousel just shows again next launch.
    if (user) AsyncStorage.setItem(welcomeSeenKey(user.id), '1').catch(reportError);
    router.replace('/(app)');
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      {/* Invisible — decodes the coin bitmap in the background for the
          whole 'welcome' + 'trial-started' steps' worth of time before
          IntroQuotePage's own Animated.Image ever asks for it, so that
          first real render doesn't kick off the decode and the fade-in
          animation at the same moment. Sized to match the real render (RN
          picks/caches a resolution variant per requested size) rather than
          a 1x1 stand-in. */}
      <Image source={require('../../assets/coin.png')} style={{ width: 56, height: 56, opacity: 0, position: 'absolute' }} />

      {step === 'welcome' && <WelcomeGreetingPage name={firstName} onDone={next} />}

      {step === 'trial-started' && <TrialStartedPage onDone={next} soundPlayer={trialSound} />}

      {step === 'intro' && <IntroQuotePage onFinish={finish} />}
    </View>
  );
}
