import { useState, useEffect } from 'react';
import { useRouter, Link } from 'expo-router';
import { View, Text, Platform, Keyboard, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { useAuth } from '../../context/AuthContext';
import { GlassTextInput, GlassPressable } from '../../components/Glass';
import { Spinner } from '../../components/icons';

export default function SignupScreen() {
  const { signup } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function setField(key, value) {
    setForm(f => ({ ...f, [key]: value }));
    setError('');
  }

  // Same manual-tracking pattern as login.js — KeyboardAvoidingView's
  // `behavior` is a no-op on Android (undefined), and windowSoftInputMode is
  // "adjustNothing" app-wide now, so nothing else would move this content
  // above the keyboard without it.
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
  const containerStyle = useAnimatedStyle(() => ({ paddingBottom: keyboardOffset.value }));

  async function handleSubmit() {
    const name = form.name.trim();
    const email = form.email.trim();
    if (!name || !email || !form.password || !form.confirmPassword) {
      setError('Please fill in all fields');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await signup({ name, email, password: form.password });
      router.replace('/(auth)/welcome');
    } catch (err) {
      const msg = err.message || '';
      if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already exists')) {
        setError('An account with this email already exists. Please log in.');
      } else {
        setError(msg || 'Sign up failed. Please try again.');
      }
      setLoading(false);
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
            <Text className="text-white/35 text-sm font-medium mb-2 uppercase tracking-wider">Name</Text>
            <GlassTextInput
              value={form.name}
              onChangeText={t => setField('name', t)}
              placeholder="Full Name"
              autoComplete="name"
              textContentType="name"
            />
          </View>

          <View>
            <Text className="text-white/35 text-sm font-medium mb-2 uppercase tracking-wider">Email</Text>
            <GlassTextInput
              value={form.email}
              onChangeText={t => setField('email', t)}
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
            />
          </View>

          <View>
            <Text className="text-white/35 text-sm font-medium mb-2 uppercase tracking-wider">Password</Text>
            <GlassTextInput
              value={form.password}
              onChangeText={t => setField('password', t)}
              placeholder="••••••••"
              autoComplete="password-new"
              textContentType="newPassword"
              secureTextEntry
            />
          </View>

          <View>
            <Text className="text-white/35 text-sm font-medium mb-2 uppercase tracking-wider">Confirm Password</Text>
            <GlassTextInput
              value={form.confirmPassword}
              onChangeText={t => setField('confirmPassword', t)}
              placeholder="••••••••"
              autoComplete="password-new"
              textContentType="newPassword"
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
                <Spinner color="#000000" trackColor="rgba(0,0,0,0.25)" />
                <Text className="text-black text-base font-semibold">Creating account…</Text>
              </>
            ) : (
              <Text className="text-black text-base font-semibold">Create Account</Text>
            )}
          </GlassPressable>
        </View>

        <View className="flex-row justify-center mt-6">
          <Text className="text-white/35 text-base">Already have an account? </Text>
          <Link href="/(auth)/login">
            <Text className="text-white font-medium text-base">Log In</Text>
          </Link>
        </View>
      </View>
    </Animated.View>
    </Pressable>
  );
}
