import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, Text } from 'react-native';
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
      <Text className="text-white/40 text-sm text-center max-w-[260px]">Redirecting to login…</Text>
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

  if (done) return <SuccessScreen />;

  if (!ready) {
    return (
      <View className="flex-1 bg-bg justify-center items-center px-6">
        <Spinner />
        <Text className="text-white/30 text-sm mt-4">Verifying reset link…</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-bg justify-center px-6">
      <View className="w-full max-w-[400px] self-center">
        <View className="items-center mb-10">
          <Text className="text-white/30 text-sm">Choose a strong password.</Text>
        </View>

        <Text className="text-white text-2xl font-semibold mb-8 text-center">Set new password</Text>

        <View className="gap-4">
          <View>
            <Text className="text-white/35 text-xs font-medium mb-2 uppercase tracking-wider">New Password</Text>
            <GlassTextInput
              value={password}
              onChangeText={t => { setPassword(t); setError(''); }}
              placeholder="••••••••"
              secureTextEntry
            />
          </View>

          <View>
            <Text className="text-white/35 text-xs font-medium mb-2 uppercase tracking-wider">Confirm Password</Text>
            <GlassTextInput
              value={confirm}
              onChangeText={t => { setConfirm(t); setError(''); }}
              placeholder="••••••••"
              secureTextEntry
            />
          </View>

          {!!error && <Text className="text-red-400 text-xs text-center">{error}</Text>}

          <GlassPressable
            variant="active"
            onPress={handleSubmit}
            disabled={loading}
            className="w-full py-[14px] rounded-2xl mt-2 flex-row items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Spinner />
                <Text className="text-white text-sm font-semibold">Updating…</Text>
              </>
            ) : (
              <Text className="text-white text-sm font-semibold">Update Password</Text>
            )}
          </GlassPressable>
        </View>
      </View>
    </View>
  );
}
