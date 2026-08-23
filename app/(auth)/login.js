import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, Text, Platform, Keyboard, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAuth } from '../../context/AuthContext';
import { GlassTextInput, GlassPressable } from '../../components/Glass';
import { Spinner, GoogleIcon } from '../../components/icons';

// One screen for both new and returning users — email + OTP makes the
// old "sign up" vs "log in" distinction moot, sendOtp() creates the
// account on first use if it doesn't exist yet.
export default function LoginScreen() {
  const { sendOtp, signInWithApple, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(null); // null | 'apple' | 'google'
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

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
    const trimmed = email.trim();
    if (!trimmed) { setError('Please enter your email'); return; }
    setLoading(true);
    setError('');
    try {
      await sendOtp({ email: trimmed });
      router.push({ pathname: '/(auth)/otp', params: { email: trimmed } });
    } catch (err) {
      setError(err.message || 'Failed to send code. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function routeAfterSignIn(isNewUser) {
    router.replace(isNewUser ? '/(auth)/name' : '/(app)');
  }

  async function handleAppleSignIn() {
    setError('');
    setOauthLoading('apple');
    try {
      const { isNewUser } = await signInWithApple();
      routeAfterSignIn(isNewUser);
    } catch (err) {
      // User dismissing the Apple sheet isn't an error worth surfacing.
      if (err.code !== 'ERR_REQUEST_CANCELED') {
        setError(err.message || 'Apple sign-in failed. Please try again.');
      }
    } finally {
      setOauthLoading(null);
    }
  }

  async function handleGoogleSignIn() {
    setError('');
    setOauthLoading('google');
    try {
      const { isNewUser } = await signInWithGoogle();
      routeAfterSignIn(isNewUser);
    } catch (err) {
      setError(err.message || 'Google sign-in failed. Please try again.');
    } finally {
      setOauthLoading(null);
    }
  }

  return (
    <Pressable onPress={Keyboard.dismiss} style={{ flex: 1 }}>
    <Animated.View className="flex-1 bg-bg justify-center px-6" style={containerStyle}>
      <View className="w-full max-w-[400px] self-center">
        <View className="items-center mb-10">
          <Text className="text-white text-xl font-semibold mb-1">Okana</Text>
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
            disabled={loading || !!oauthLoading}
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

        <View className="flex-row items-center my-6">
          <View className="flex-1 h-[1px] bg-white/10" />
          <Text className="text-white/25 text-sm mx-3">or</Text>
          <View className="flex-1 h-[1px] bg-white/10" />
        </View>

        <View className="gap-3">
          {appleAvailable && (
            <View style={{ opacity: oauthLoading && oauthLoading !== 'apple' ? 0.5 : 1 }} pointerEvents={oauthLoading ? 'none' : 'auto'}>
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={16}
                style={{ width: '100%', height: 52 }}
                onPress={handleAppleSignIn}
              />
            </View>
          )}

          <GlassPressable
            variant="glass"
            radius={16}
            onPress={handleGoogleSignIn}
            disabled={!!oauthLoading}
            className="w-full py-4 flex-row items-center justify-center gap-2"
          >
            {oauthLoading === 'google' ? (
              <Spinner />
            ) : (
              <>
                <GoogleIcon size={19} />
                <Text className="text-white font-semibold" style={{ fontSize: 17 }}>Continue with Google</Text>
              </>
            )}
          </GlassPressable>
        </View>
      </View>
    </Animated.View>
    </Pressable>
  );
}
