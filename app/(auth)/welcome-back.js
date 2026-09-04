import { useEffect } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing } from 'react-native-reanimated';
import { useAuth } from '../../context/AuthContext';

const SETTLE_EASING = Easing.bezier(0.16, 1, 0.3, 1);
const HOLD_MS = 6000; // a brief courtesy beat, not the full first-run carousel

// Shown to a returning user right after they verify their OTP — index.js's
// own redirect logic skips straight to Home on every other app open (a
// persisted session never touches this screen), so this only appears on an
// actual fresh sign-in, not on every cold start.
export default function WelcomeBackScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const firstName = (profile?.name || 'there').split(' ')[0];

  const helloProgress = useSharedValue(0);
  const titleProgress = useSharedValue(0);

  useEffect(() => {
    helloProgress.value = withDelay(150, withTiming(1, { duration: 500, easing: SETTLE_EASING }));
    titleProgress.value = withDelay(650, withTiming(1, { duration: 500, easing: SETTLE_EASING }));

    const t = setTimeout(() => router.replace('/(app)'), HOLD_MS);
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
    <View style={{ flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
      <Animated.Text style={[{ color: '#ffffff', fontSize: 15, fontWeight: '400', marginBottom: 6 }, helloStyle]}>
        Hello <Text style={{ color: '#4ade80', fontWeight: '600' }}>{firstName}</Text>👋
      </Animated.Text>
      <Animated.Text style={[{ color: '#ffffff', fontSize: 18, fontWeight: '600' }, titleStyle]}>
        Welcome back to Okana
      </Animated.Text>
    </View>
  );
}
