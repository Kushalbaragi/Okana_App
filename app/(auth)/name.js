import { useEffect, useState } from 'react';
import { View, Text, Platform, Keyboard, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { useAuth } from '../../context/AuthContext';
import { GlassTextInput, GlassPressable } from '../../components/Glass';
import { Spinner } from '../../components/icons';

// Only reached once, right after a brand-new account's first OTP
// verification — the old signup form used to collect this alongside a
// password; OTP has no equivalent step, so it happens here instead.
export default function NameScreen() {
  const router = useRouter();
  const { setName } = useAuth();
  const [name, setNameInput] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

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

  async function handleContinue() {
    const trimmed = name.trim();
    if (!trimmed) { setError('Please enter your name'); return; }
    setSaving(true);
    setError('');
    try {
      await setName({ name: trimmed });
      router.replace('/(auth)/welcome');
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
      setSaving(false);
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

          <Text className="text-white text-2xl font-semibold mb-8 text-center">What should we call you?</Text>

          <View className="gap-4">
            <View>
              <Text className="text-white text-[15px] font-medium mb-2">Name</Text>
              <GlassTextInput
                autoFocus
                value={name}
                onChangeText={t => { setNameInput(t); setError(''); }}
                placeholder="Full Name"
                autoComplete="name"
                textContentType="name"
                onSubmitEditing={handleContinue}
              />
            </View>

            {!!error && <Text className="text-red-400 text-base text-center">{error}</Text>}

            <GlassPressable
              variant="active"
              radius={16}
              onPress={handleContinue}
              disabled={saving || !name.trim()}
              className="w-full py-[14px] mt-2 flex-row items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Spinner color="#000000" trackColor="rgba(0,0,0,0.25)" />
                  <Text className="text-black text-base font-semibold">Saving…</Text>
                </>
              ) : (
                <Text className="text-black text-base font-semibold">Continue</Text>
              )}
            </GlassPressable>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}
