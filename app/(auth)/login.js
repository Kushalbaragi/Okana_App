import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, Text, Platform, Keyboard, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { isConnectivityError } from '../../utils/errors';
import { GlassTextInput, GlassPressable } from '../../components/Glass';
import { Spinner } from '../../components/icons';

// One screen for both new and returning users — email + OTP makes the
// old "sign up" vs "log in" distinction moot, sendOtp() creates the
// account on first use if it doesn't exist yet.
export default function LoginScreen() {
  const { sendOtp } = useAuth();
  const { isOnline, notifyOffline } = useNetwork();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Tracked manually rather than via KeyboardAvoidingView — see AnimatedModal.js
  // for why: its own internal animation was re-triggering (visibly) every
  // time focus moved between fields, even though the keyboard's actual
  // height never changed. React state naturally no-ops on an identical value.
  // The raw state value only drives an animated shared value (smoothly
  // interpolated via withTiming) rather than being used directly in a style —
  // used directly, a genuine height change (open/close) would still snap
  // instead of transitioning.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const keyboardOffset = useSharedValue(0);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, e => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);
  useEffect(() => {
    keyboardOffset.value = withTiming(keyboardHeight, { duration: 250, easing: Easing.out(Easing.cubic) });
  }, [keyboardHeight, keyboardOffset]);
  // Stays centered always — paddingBottom growing smoothly as the keyboard
  // rises naturally shifts the centered midpoint upward, without needing a
  // discrete (and therefore non-animatable) justifyContent switch.
  const containerStyle = useAnimatedStyle(() => ({ paddingBottom: keyboardOffset.value }));

  async function handleSubmit() {
    // Belt-and-suspenders alongside the button's own `disabled` prop — the
    // field's onSubmitEditing and the button's onPress both call this, and
    // React's state update isn't synchronous, so a fast Enter-then-tap
    // could otherwise fire signInWithOtp twice before `loading` re-renders.
    if (loading) return;
    const trimmed = email.trim();
    if (!trimmed) { setError('Please enter your email'); return; }
    if (!isOnline) { notifyOffline(); return; }
    setLoading(true);
    setError('');
    try {
      await sendOtp({ email: trimmed });
      router.push({ pathname: '/(auth)/otp', params: { email: trimmed } });
    } catch (err) {
      if (isConnectivityError(err, isOnline)) { notifyOffline(); }
      else { setError(err.message || 'Failed to send code. Please try again.'); }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Pressable onPress={Keyboard.dismiss} style={{ flex: 1 }}>
      <Animated.View className="flex-1 bg-bg justify-center px-6" style={containerStyle}>
        <View className="w-full max-w-[400px] self-center">
          <View className="items-center mb-10">
            <Text className="text-white text-[22px] font-semibold mb-1">Okana</Text>
            <Text className="text-white/30 text-base">Your money, beautifully tracked.</Text>
          </View>

          <View className="gap-4">
            <View>
              <Text className="text-white text-[15px] font-medium mb-2">Email</Text>
              <GlassTextInput
                value={email}
                onChangeText={t => { setEmail(t); setError(''); }}
                placeholder="you@example.com"
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
                onSubmitEditing={handleSubmit}
              />
            </View>

            <Text className="text-red-400 text-sm text-center" style={{ minHeight: 18 }} numberOfLines={1}>
              {error}
            </Text>

            <GlassPressable
              variant="active"
              radius={16}
              onPress={handleSubmit}
              disabled={loading}
              className="w-full py-4 flex-row items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Spinner color="#000000" trackColor="rgba(0,0,0,0.25)" />
                  <Text className="text-black text-base font-semibold">Sending code…</Text>
                </>
              ) : (
                <Text className="text-black text-base font-semibold">Continue</Text>
              )}
            </GlassPressable>
          </View>

          <Text className="text-white/25 text-sm text-center mt-4">
            We'll email you a code — no password needed.
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}
