import { useState } from 'react';
import { useRouter, Link } from 'expo-router';
import { View, Text } from 'react-native';
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

  async function handleSubmit() {
    if (!form.name || !form.email || !form.password || !form.confirmPassword) {
      setError('Please fill in all fields');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await signup({ name: form.name, email: form.email, password: form.password });
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
    <View className="flex-1 bg-bg justify-center px-6">
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
            />
          </View>

          <View>
            <Text className="text-white/35 text-sm font-medium mb-2 uppercase tracking-wider">Password</Text>
            <GlassTextInput
              value={form.password}
              onChangeText={t => setField('password', t)}
              placeholder="••••••••"
              secureTextEntry
            />
          </View>

          <View>
            <Text className="text-white/35 text-sm font-medium mb-2 uppercase tracking-wider">Confirm Password</Text>
            <GlassTextInput
              value={form.confirmPassword}
              onChangeText={t => setField('confirmPassword', t)}
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
                <Text className="text-white text-base font-semibold">Creating account…</Text>
              </>
            ) : (
              <Text className="text-white text-base font-semibold">Create Account</Text>
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
    </View>
  );
}
