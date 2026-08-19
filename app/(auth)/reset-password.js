import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, Text, Platform, Keyboard } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { supabase } from '../../lib/supabase';
import { GlassTextInput, GlassPressable } from '../../components/Glass';
import { Spinner, CheckIcon } from '../../components/icons';

function SuccessScreen() {
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => router.replace('/(auth)/login'), 3000);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <View className="flex-1 bg-bg justify-center items-center px-6">
      <View
        className="w-20 h-20 rounded-full items-center justify-center mb-6"
        style={{ backgroundColor: 'rgba(74,222,128,0.12)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)' }}
      >
        <CheckIcon />
      </View>
      <Text className="text-white text-xl font-semibold mb-2">Password updated!</Text>
      <Text className="text-white/40 text-base text-center max-w-[260px]">Redirecting to login…</Text>
    </View>
  );
}

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [ready, setReady] = useState(false);

  // The root layout's Linking handler exchanges the deep-link code and sets
  // the recovery session, which fires PASSWORD_RECOVERY here.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit() {
    if (!password) { setError('Please enter a new password'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }

    setLoading(true);
    setError('');
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      setDone(true);
    } catch (err) {
      setError(err.message || 'Failed to update password. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // Tracked manually rather than via KeyboardAvoidingView — see login.js /
  // AnimatedModal.js for why. The raw state only drives an animated shared
  // value (interpolated via withTiming) so a genuine height change still
  // transitions smoothly instead of snapping.
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

  if (done) return <SuccessScreen />;

  if (!ready) {
    return (
      <View className="flex-1 bg-bg justify-center items-center px-6">
        <Spinner />
        <Text className="text-white/30 text-base mt-4">Verifying reset link…</Text>
      </View>
    );
  }

  return (
    <Animated.View className="flex-1 bg-bg justify-center px-6" style={containerStyle}>
      <View className="w-full max-w-[400px] self-center">
        <View className="items-center mb-10">
          <Text className="text-white/30 text-base">Choose a strong password.</Text>
        </View>

        <Text className="text-white text-2xl font-semibold mb-8 text-center">Set new password</Text>

        <View className="gap-4">
          <View>
            <Text className="text-white/35 text-sm font-medium mb-2 uppercase tracking-wider">New Password</Text>
            <GlassTextInput
              value={password}
              onChangeText={t => { setPassword(t); setError(''); }}
              placeholder="••••••••"
              secureTextEntry
            />
          </View>

          <View>
            <Text className="text-white/35 text-sm font-medium mb-2 uppercase tracking-wider">Confirm Password</Text>
            <GlassTextInput
              value={confirm}
              onChangeText={t => { setConfirm(t); setError(''); }}
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
                <Text className="text-white text-base font-semibold">Updating…</Text>
              </>
            ) : (
              <Text className="text-white text-base font-semibold">Update Password</Text>
            )}
          </GlassPressable>
        </View>
      </View>
    </Animated.View>
  );
}
