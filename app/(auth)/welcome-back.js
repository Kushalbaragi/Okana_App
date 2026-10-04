import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { welcomeSeenKey } from './welcome';
import { AuthBackground } from '../../components/AuthKit';
import Greeting from '../../components/Greeting';
import { reportError } from '../../utils/errors';

// How long the greeting stays before Home.
const HOLD_MS = 3500;

// Shown to a returning user right after they verify their OTP — index.js's
// own redirect logic skips straight to Home on every other app open (a
// persisted session never touches this screen), so this only appears on an
// actual fresh sign-in, not on every cold start.
export default function WelcomeBackScreen() {
  const router = useRouter();
  const { profile, user } = useAuth();
  const firstName = (profile?.name || 'there').split(' ')[0];

  useEffect(() => {
    // Someone signing back in has no use for the new-account pages (index.js
    // sends anyone without this key there on their next launch).
    if (user) AsyncStorage.setItem(welcomeSeenKey(user.id), '1').catch(reportError);
    const t = setTimeout(() => router.replace('/(app)'), HOLD_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      <AuthBackground />
      <Greeting label="Welcome back" name={firstName} />
    </View>
  );
}
