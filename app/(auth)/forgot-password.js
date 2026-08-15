import { useState } from 'react';
import { Link } from 'expo-router';
import * as Linking from 'expo-linking';
import { View, Text } from 'react-native';
import { supabase } from '../../lib/supabase';
import { GlassTextInput, GlassPressable } from '../../components/Glass';
import { Spinner, CheckIcon } from '../../components/icons';

function SuccessScreen() {
  return (
    <View className="flex-1 bg-bg justify-center items-center px-6">
      <View
        className="w-20 h-20 rounded-full items-center justify-center mb-6"
        style={{ backgroundColor: 'rgba(74,222,128,0.12)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)' }}
      >
        <CheckIcon />
      </View>
      <Text className="text-white text-xl font-semibold mb-2">Check your inbox</Text>
      <Text className="text-white/40 text-sm text-center max-w-[260px] mb-8">
        We've sent a password reset link to your email address.
      </Text>
      <Link href="/(auth)/login">
        <Text className="text-white/50 text-sm">Back to login</Text>
      </Link>
    </View>
  );
}

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    if (!email) { setError('Please enter your email'); return; }
    setLoading(true);
    setError('');
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: Linking.createURL('reset-password'),
      });
      if (err) throw err;
      setDone(true);
    } catch (err) {
      setError(err.message || 'Failed to send reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (done) return <SuccessScreen />;

  return (
    <View className="flex-1 bg-bg justify-center px-6">
      <View className="w-full max-w-[400px] self-center">
        <View className="items-center mb-10">
          <Text className="text-white/30 text-sm">We'll send you a reset link.</Text>
        </View>

        <Text className="text-white text-2xl font-semibold mb-2 text-center">Forgot password?</Text>
        <Text className="text-white/35 text-sm text-center mb-8">Enter your email and we'll send a reset link.</Text>

        <View className="gap-4">
          <View>
            <Text className="text-white/35 text-xs font-medium mb-2 uppercase tracking-wider">Email</Text>
            <GlassTextInput
              value={email}
              onChangeText={t => { setEmail(t); setError(''); }}
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          {!!error && <Text className="text-red-400 text-xs text-center">{error}</Text>}

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
                <Text className="text-white text-sm font-semibold">Sending…</Text>
              </>
            ) : (
              <Text className="text-white text-sm font-semibold">Send Reset Link</Text>
            )}
          </GlassPressable>
        </View>

        <View className="flex-row justify-center mt-6">
          <Text className="text-white/35 text-sm">Remember your password? </Text>
          <Link href="/(auth)/login">
            <Text className="text-white font-medium text-sm">Log In</Text>
          </Link>
        </View>
      </View>
    </View>
  );
}
