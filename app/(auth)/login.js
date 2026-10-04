import { useState } from 'react';
import { useRouter } from 'expo-router';
import { View, Text, Keyboard, Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { isConnectivityError, reportError } from '../../utils/errors';
import { AuthBackground, AuthTitle, AuthField, MailIcon, PillButton, useKeyboardLift, useTitleTop } from '../../components/AuthKit';
import { GUTTER } from '../../utils/spacing';
import { FONT } from '../../utils/type';

// Deliberately loose (no full RFC 5322 validation) — just enough to catch
// an obvious typo (missing @, no domain) before spending a network round
// trip on it, not to reject anything Supabase would otherwise accept.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const top = useTitleTop();
  const lift = useKeyboardLift();

  async function handleSubmit() {
    // Belt-and-suspenders alongside the button's own `disabled` prop — the
    // field's onSubmitEditing and the button's onPress both call this, and
    // React's state update isn't synchronous, so a fast Enter-then-tap
    // could otherwise fire signInWithOtp twice before `loading` re-renders.
    if (loading) return;
    const trimmed = email.trim();
    if (!trimmed) { setError('Please enter your email'); return; }
    if (!EMAIL_PATTERN.test(trimmed)) { setError('Please enter a valid email'); return; }
    if (!isOnline) { notifyOffline(); return; }
    setLoading(true);
    setError('');
    try {
      await sendOtp({ email: trimmed });
      router.push({ pathname: '/(auth)/otp', params: { email: trimmed } });
    } catch (err) {
      if (isConnectivityError(err, isOnline)) { notifyOffline(); }
      else { reportError(err); setError(err.message || 'Failed to send code. Please try again.'); }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Pressable onPress={Keyboard.dismiss} style={{ flex: 1, backgroundColor: '#000000' }}>
      <AuthBackground />
      <Animated.View style={[{ flex: 1, paddingTop: top }, lift]}>
        <AuthTitle title="Enter your email" sub={"We'll email you a code. No password needed."} />
        <View style={{ marginTop: 40 }}>
          <AuthField
            icon={<MailIcon />}
            value={email}
            onChangeText={t => { setEmail(t); setError(''); }}
            onClear={() => { setEmail(''); setError(''); }}
            placeholder="you@example.com"
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            maxLength={254}
            returnKeyType="go"
            onSubmitEditing={handleSubmit}
          />
          <Text numberOfLines={1} style={{ fontSize: FONT.caption, color: 'rgba(248,113,113,0.9)', textAlign: 'center', marginTop: 14, minHeight: 18, paddingHorizontal: GUTTER }}>
            {error}
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        <PillButton label="Continue" onPress={handleSubmit} loading={loading} loadingLabel="Sending code…" dim={!email.trim()} />
      </Animated.View>
    </Pressable>
  );
}
