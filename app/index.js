import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { ONBOARDING_SEEN_KEY } from './onboarding';
import { welcomeSeenKey } from './(auth)/welcome';

export default function Index() {
  const { user, loading } = useAuth();
  // null = still checking AsyncStorage, not yet known either way.
  const [onboardingSeen, setOnboardingSeen] = useState(null);
  const [welcomeSeen, setWelcomeSeen] = useState(null);

  useEffect(() => {
    // Falls back to "not seen" rather than hanging on the loading spinner
    // forever if this read fails.
    AsyncStorage.getItem(ONBOARDING_SEEN_KEY)
      .then(v => setOnboardingSeen(v === '1'))
      .catch(() => setOnboardingSeen(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    AsyncStorage.getItem(welcomeSeenKey(user.id))
      .then(v => setWelcomeSeen(v === '1'))
      .catch(() => setWelcomeSeen(false));
  }, [user]);

  if (loading || onboardingSeen === null || (user && welcomeSeen === null)) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator color="#ffffff" />
      </View>
    );
  }

  if (user) {
    // Reaching OTP verification already makes `user` truthy, well before
    // name.js or welcome.js's carousel (including the trial-purchase step)
    // has actually run — without these, closing the app anywhere in that
    // stretch (e.g. right after a failed "Start Free Trial") would land
    // straight on Home next launch, silently skipping the rest.
    if (!user.user_metadata?.name) return <Redirect href="/(auth)/name" />;
    if (!welcomeSeen) return <Redirect href="/(auth)/welcome" />;
    return <Redirect href="/(app)" />;
  }
  if (!onboardingSeen) return <Redirect href="/onboarding" />;
  return <Redirect href="/(auth)/login" />;
}
