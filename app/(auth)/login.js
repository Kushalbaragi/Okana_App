import { useState, useEffect } from 'react';
import { useRouter, Link } from 'expo-router';
import { View, Text, Platform, Keyboard } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { useAuth } from '../../context/AuthContext';
import { GlassTextInput, GlassPressable } from '../../components/Glass';
import { Spinner } from '../../components/icons';

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function setField(key, value) {
    setForm(f => ({ ...f, [key]: value }));
    setError('');
  }

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
    if (!form.email || !form.password) { setError('Please fill in all fields'); return; }
    setLoading(true);
    try {
      await login({ email: form.email, password: form.password });
      router.replace('/(app)');
    } catch {
      // Deliberately generic — distinguishing "wrong password" from "no such
      // account" lets an attacker enumerate registered emails.
      setError('Incorrect email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Animated.View className="flex-1 bg-bg justify-center px-6" style={containerStyle}>
      <View className="w-full max-w-[400px] self-center">
        <View className="items-center mb-10">
          <Text className="text-white text-xl font-semibold mb-1">Okana</Text>
          <Text className="text-white/30 text-base">Your money, beautifully tracked.</Text>
        </View>

        <View className="gap-4">
          <View>
            <Text className="text-white/35 text-sm font-medium mb-2 uppercase tracking-wider">Email</Text>
            <GlassTextInput
              value={form.email}
              onChangeText={t => setField('email', t)}
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <View>
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-white/35 text-sm font-medium uppercase tracking-wider">Password</Text>
              <Link href="/(auth)/forgot-password">
                <Text className="text-white/35 text-base">Forgot password?</Text>
              </Link>
            </View>
            <GlassTextInput
              value={form.password}
              onChangeText={t => setField('password', t)}
              placeholder="••••••••"
              secureTextEntry
            />
          </View>

          {!!error && <Text className="text-red-400 text-base text-center">{error}</Text>}

          <GlassPressable
            variant="active"
            radius={16}
            onPress={handleSubmit}
            disabled={loading}
            className="w-full py-[14px] mt-2 flex-row items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Spinner />
                <Text className="text-white text-base font-semibold">Logging in…</Text>
              </>
            ) : (
              <Text className="text-white text-base font-semibold">Log In</Text>
            )}
          </GlassPressable>
        </View>

        <View className="flex-row justify-center mt-6">
          <Text className="text-white/35 text-base">Don't have an account? </Text>
          <Link href="/(auth)/signup">
            <Text className="text-white font-medium text-base">Sign Up</Text>
          </Link>
        </View>
      </View>
    </Animated.View>
  );
}
