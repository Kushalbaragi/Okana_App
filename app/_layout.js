import '../global.css';
import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

// Password-reset links land here as okana://reset-password?code=...
// (see ForgotPasswordPage's redirectTo). Exchanging the code sets the
// recovery session and fires Supabase's PASSWORD_RECOVERY auth event,
// which ResetPasswordScreen listens for.
function useAuthDeepLinks() {
  useEffect(() => {
    function handleUrl({ url }) {
      const { queryParams } = Linking.parse(url);
      if (queryParams?.code) {
        supabase.auth.exchangeCodeForSession(String(queryParams.code));
      }
    }
    Linking.getInitialURL().then(url => { if (url) handleUrl({ url }); });
    const sub = Linking.addEventListener('url', handleUrl);
    return () => sub.remove();
  }, []);
}

export default function RootLayout() {
  useAuthDeepLinks();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0a0a0a' } }} />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
