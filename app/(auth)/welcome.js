import { useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAudioPlayer } from 'expo-audio';
import { useAuth } from '../../context/AuthContext';
import SlideStack from '../../components/SlideStack';
import { SuccessBadge } from '../../components/SuccessBadge';
import { AuthBackground, PillButton } from '../../components/AuthKit';
import Greeting from '../../components/Greeting';
import { darkText } from '../../utils/colors';
import { reportError } from '../../utils/errors';
import { SETTLE_EASING } from '../../utils/motion';
import { GUTTER } from '../../utils/spacing';
import { FONT } from '../../utils/type';

const SUCCESS_SOUND = require('../../assets/sounds/success.wav');

// How long each page stays before the next slides in.
const GREETING_HOLD_MS = 6000;
const ALL_SET_HOLD_MS = 6000;

// Set only once the pages are actually finished (not on mount) — app/index.js
// redirects back here on every cold launch until this is set, so closing the
// app partway picks the sequence back up next time.
export function welcomeSeenKey(userId) {
  return `okana_welcome_seen_${userId}`;
}

// The reveal, in order: a beat of nothing, then the check mark with its ding,
// then the title, then the line under it, each fading in on its own.
const BADGE_DELAY_MS = 700;
const TITLE_DELAY_MS = BADGE_DELAY_MS + 900;
const SUB_DELAY_MS = TITLE_DELAY_MS + 600;
const FADE_MS = 600;
// The badge's size, held as a blank until the badge appears so
// nothing below it moves when it does.
const BADGE_SIZE = 48;

function FadeIn({ delay, play, children }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    if (play) progress.value = withDelay(delay, withTiming(1, { duration: FADE_MS, easing: SETTLE_EASING }));
  }, [delay, play, progress]);
  const style = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ translateY: (1 - progress.value) * 10 }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

// Confirms the trial that grant_free_trial_on_signup already started
// server-side the instant the account was created — nothing happens here on
// press, this is purely informational. Gets the success ding (see
// SuccessBadge's playSound).
// `active` is whether this page is the one showing: the reveal waits for it, so
// it is not played out of sight while the greeting is still on screen.
function AllSetPage({ soundPlayer, active }) {
  const [badgeShown, setBadgeShown] = useState(false);
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setBadgeShown(true), BADGE_DELAY_MS);
    return () => clearTimeout(t);
  }, [active]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
      <View style={{ width: BADGE_SIZE, height: BADGE_SIZE, marginBottom: 22 }}>
        {badgeShown && <SuccessBadge size={BADGE_SIZE} iconSize={22} playSound player={soundPlayer} />}
      </View>
      <FadeIn delay={TITLE_DELAY_MS} play={active}>
        <Text style={{ fontSize: FONT.title, fontWeight: '600', color: '#ffffff', textAlign: 'center' }}>You're all set</Text>
      </FadeIn>
      <FadeIn delay={SUB_DELAY_MS} play={active}>
        <Text style={{ fontSize: FONT.caption, color: darkText.tertiary, marginTop: 10, textAlign: 'center', lineHeight: 19 }}>
          {'30 days free.\nNo payment required.'}
        </Text>
      </FadeIn>
    </View>
  );
}

function TrackPage({ onFinish, bottom }) {
  return (
    <View style={{ flex: 1, paddingBottom: bottom }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: GUTTER }}>
        <Text style={{ fontSize: FONT.title, fontWeight: '600', color: '#ffffff', textAlign: 'center' }}>Track it</Text>
        <Text style={{ fontSize: FONT.caption, color: darkText.tertiary, marginTop: 10, textAlign: 'center' }}>What gets tracked gets improved.</Text>
      </View>
      <PillButton label="Start tracking" onPress={onFinish} />
    </View>
  );
}

// Shown once, right after a new account is named: a greeting, then "You're all
// set", then "Track it" with the one button into the app.
export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const firstName = (profile?.name || 'there').split(' ')[0];
  const [page, setPage] = useState(0);
  const finished = useRef(false);
  // Created here (mounted well before the badge plays it) so the sound has
  // loaded by then — see the comment on SuccessBadge's `player` prop.
  const sound = useAudioPlayer(SUCCESS_SOUND);

  useEffect(() => {
    if (page > 1) return;
    const t = setTimeout(() => setPage(page + 1), page === 0 ? GREETING_HOLD_MS : ALL_SET_HOLD_MS);
    return () => clearTimeout(t);
  }, [page]);

  function finish() {
    // A second tap while the app is already opening does nothing.
    if (finished.current) return;
    finished.current = true;
    // If this can't be saved, the pages just show again next launch.
    if (user) AsyncStorage.setItem(welcomeSeenKey(user.id), '1').catch(reportError);
    router.replace('/(app)');
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      <AuthBackground />
      <SlideStack index={page}>
        <Greeting key="greeting" label="Welcome" name={firstName} />
        <AllSetPage key="all-set" soundPlayer={sound} active={page >= 1} />
        <TrackPage key="track" onFinish={finish} bottom={insets.bottom + 28} />
      </SlideStack>
    </View>
  );
}
