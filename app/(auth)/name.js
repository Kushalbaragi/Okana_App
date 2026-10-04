import { useState } from 'react';
import { View, Text, Keyboard, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import Animated from 'react-native-reanimated';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { isConnectivityError, reportError } from '../../utils/errors';
import { AuthBackground, AuthTitle, AuthField, PersonIcon, PillButton, useKeyboardLift, useTitleTop } from '../../components/AuthKit';
import { GUTTER } from '../../utils/spacing';
import { FONT } from '../../utils/type';

// Only reached once, right after a brand-new account's first OTP
// verification — the old signup form used to collect this alongside a
// password; OTP has no equivalent step, so it happens here instead.
export default function NameScreen() {
  const router = useRouter();
  const { setName } = useAuth();
  const { isOnline, notifyOffline } = useNetwork();
  const [name, setNameInput] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const top = useTitleTop();
  const lift = useKeyboardLift();

  async function handleContinue() {
    // Belt-and-suspenders alongside the button's own `disabled` prop — see
    // login.js's handleSubmit for why: onSubmitEditing and a button tap can
    // both fire this before React's state update re-renders the button.
    if (saving) return;
    const trimmed = name.trim();
    if (!trimmed) { setError('Please enter your name'); return; }
    if (!isOnline) { notifyOffline(); return; }
    setSaving(true);
    setError('');
    try {
      await setName({ name: trimmed });
      router.replace('/(auth)/welcome');
    } catch (err) {
      if (isConnectivityError(err, isOnline)) { notifyOffline(); }
      else { reportError(err); setError(err.message || 'Something went wrong. Please try again.'); }
      setSaving(false);
    }
  }

  return (
    <Pressable onPress={Keyboard.dismiss} style={{ flex: 1, backgroundColor: '#000000' }}>
      <AuthBackground />
      <Animated.View style={[{ flex: 1, paddingTop: top }, lift]}>
        <AuthTitle title="What should we call you?" />
        <View style={{ marginTop: 40 }}>
          <AuthField
            icon={<PersonIcon />}
            value={name}
            onChangeText={t => { setNameInput(t); setError(''); }}
            onClear={() => { setNameInput(''); setError(''); }}
            placeholder="Full name"
            autoFocus
            autoComplete="name"
            textContentType="name"
            returnKeyType="done"
            onSubmitEditing={handleContinue}
            maxLength={60}
          />
          <Text numberOfLines={1} style={{ fontSize: FONT.caption, color: 'rgba(248,113,113,0.9)', textAlign: 'center', marginTop: 14, minHeight: 18, paddingHorizontal: GUTTER }}>
            {error}
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        <PillButton label="Continue" onPress={handleContinue} loading={saving} loadingLabel="Saving…" dim={!name.trim()} />
      </Animated.View>
    </Pressable>
  );
}
