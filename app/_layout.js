import '../global.css';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { setAudioModeAsync } from 'expo-audio';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { NetworkProvider } from '../context/NetworkContext';
import { OfflineBanner } from '../components/OfflineBanner';
import { usePushToken } from '../hooks/usePushToken';
import { useNotificationRouting } from '../hooks/useNotificationRouting';
import { usePurchases } from '../hooks/usePurchases';

function AppShell() {
  const { user } = useAuth();
  usePushToken(user?.id);
  useNotificationRouting();
  usePurchases(user?.id);

  // expo-audio's default session requests exclusive audio focus — the
  // keypad's click sound (NumericKeypad) and the success chime
  // (SuccessBadge) were stopping whatever the user already had playing in
  // another app (Spotify, etc.) the instant either one fired. mixWithOthers
  // makes these short UI sounds layer on top instead of stealing focus. Set
  // once at the app root rather than per-sound-effect component, since both
  // mount/unmount repeatedly as their modals open and close.
  useEffect(() => {
    setAudioModeAsync({ interruptionMode: 'mixWithOthers' });
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0a0a0a' } }}>
        {/* Entering the app (cold launch redirect, post-OTP, post-welcome)
            replaces the default slide-from-right with a plain crossfade —
            native-stack has no built-in scale/pop transition, so this pairs
            with Dashboard's own Reanimated scale-in entrance (index.js) to
            read as a scale/pop rather than two competing slide animations. */}
        <Stack.Screen name="(app)" options={{ animation: 'fade' }} />
      </Stack>
      <OfflineBanner />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NetworkProvider>
        <AuthProvider>
          <AppShell />
        </AuthProvider>
      </NetworkProvider>
    </GestureHandlerRootView>
  );
}
