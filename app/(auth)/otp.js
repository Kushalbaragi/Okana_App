import { useEffect, useState } from 'react';
import { View, Text, Pressable, useWindowDimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming } from 'react-native-reanimated';
import { useAuth } from '../../context/AuthContext';
import { NumericKeypad, DIGIT_ONLY_KEYPAD_ROWS } from '../../components/NumericKeypad';
import { BackIcon } from '../../components/icons';

// Must match the "Email OTP Length" set in Supabase Dashboard ->
// Authentication -> Sign In / Providers -> Email, or auto-submit fires
// early/late on a mismatched code length.
const CODE_LENGTH = 6;
const RESEND_COOLDOWN_S = 60; // matches Supabase's own per-email OTP rate limit
const HORIZONTAL_PADDING = 64; // matches the px-8 (32 each side) on the containing View

// A small shake on the code boxes when a submitted code turns out wrong —
// the one bit of "reacting to failure" a plain error line under the boxes
// doesn't convey on its own.
function useShake() {
  const shakeX = useSharedValue(0);
  function shake() {
    shakeX.value = withSequence(
      withTiming(-8, { duration: 55 }),
      withTiming(8, { duration: 55 }),
      withTiming(-6, { duration: 55 }),
      withTiming(6, { duration: 55 }),
      withTiming(0, { duration: 55 }),
    );
  }
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));
  return { shake, style };
}

export default function OtpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { email } = useLocalSearchParams();
  const { verifyOtp, sendOtp } = useAuth();

  // Scales box size/gap down for longer codes so 8 boxes still fit on
  // narrow phones instead of wrapping or overflowing.
  const boxGap = CODE_LENGTH <= 6 ? 10 : 6;
  const boxSize = Math.max(30, Math.min(44, Math.floor(
    (width - HORIZONTAL_PADDING - boxGap * (CODE_LENGTH - 1)) / CODE_LENGTH
  )));
  const boxHeight = boxSize + 10;
  const digitFontSize = boxSize >= 40 ? 20 : boxSize >= 34 ? 18 : 16;

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);
  const { shake, style: shakeStyle } = useShake();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function submitCode(fullCode) {
    setVerifying(true);
    setError('');
    try {
      const { isNewUser } = await verifyOtp({ email, token: fullCode });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (isNewUser) {
        router.replace({ pathname: '/(auth)/name' });
      } else {
        router.replace('/(app)');
      }
    } catch {
      // Deliberately generic — matches the rest of the app's auth error
      // copy, doesn't distinguish "wrong code" from "expired code".
      setError('Incorrect or expired code. Please try again.');
      setCode('');
      shake();
      setVerifying(false);
    }
  }

  function handleKeyPress(key) {
    if (verifying) return;
    Haptics.selectionAsync();
    setError('');
    if (key === 'backspace') {
      setCode(c => c.slice(0, -1));
      return;
    }
    if (code.length >= CODE_LENGTH) return;
    const next = code + key;
    setCode(next);
    if (next.length === CODE_LENGTH) submitCode(next);
  }

  async function handleResend() {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setError('');
    try {
      await sendOtp({ email });
      setCooldown(RESEND_COOLDOWN_S);
    } catch (err) {
      setError(err.message || 'Failed to resend code. Please try again.');
    } finally {
      setResending(false);
    }
  }

  return (
    <View className="flex-1 bg-bg">
      <View className="flex-row items-center px-4" style={{ paddingTop: insets.top + 8, paddingBottom: 8 }}>
        <Pressable onPress={() => router.back()} className="w-9 h-9 items-center justify-center rounded-xl">
          <BackIcon />
        </Pressable>
      </View>

      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-white text-[22px] font-semibold mb-2 text-center">Enter the code</Text>
        <Text className="text-white/40 text-base text-center mb-10">
          We sent a {CODE_LENGTH}-digit code to{'\n'}
          <Text className="text-white/60">{email}</Text>
        </Text>

        <Animated.View className="flex-row" style={[{ gap: boxGap }, shakeStyle]}>
          {Array.from({ length: CODE_LENGTH }).map((_, i) => (
            <View
              key={i}
              className="items-center justify-center"
              style={{
                width: boxSize, height: boxHeight, borderRadius: 12,
                borderWidth: 1,
                borderColor: error ? 'rgba(248,113,113,0.5)' : code.length === i ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.14)',
                backgroundColor: 'transparent',
              }}
            >
              <Text className="text-white font-semibold" style={{ fontSize: digitFontSize }}>{code[i] || ''}</Text>
            </View>
          ))}
        </Animated.View>

        <Text className="text-red-400 text-sm text-center mt-5" style={{ minHeight: 18 }} numberOfLines={1}>
          {error}
        </Text>

        <Pressable onPress={handleResend} disabled={cooldown > 0 || resending} className="mt-3 py-1">
          <Text className="text-white/40 text-base">
            {cooldown > 0 ? `Resend code in ${cooldown}s` : resending ? 'Sending…' : 'Resend code'}
          </Text>
        </Pressable>
      </View>

      <NumericKeypad onKeyPress={handleKeyPress} insetBottom={insets.bottom} rows={DIGIT_ONLY_KEYPAD_ROWS} />
    </View>
  );
}
