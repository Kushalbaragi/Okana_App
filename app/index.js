import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { ONBOARDING_SEEN_KEY } from './onboarding';

export default function Index() {
  const { user, loading } = useAuth();
  // null = still checking AsyncStorage, not yet known either way.
  const [onboardingSeen, setOnboardingSeen] = useState(null);

  useEffect(() => {
    // Falls back to "not seen" rather than hanging on the loading spinner
    // forever if this read fails.
    AsyncStorage.getItem(ONBOARDING_SEEN_KEY)
      .then(v => setOnboardingSeen(v === '1'))
      .catch(() => setOnboardingSeen(false));
  }, []);

  if (loading || onboardingSeen === null) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator color="#ffffff" />
      </View>
    );
  }

  if (user) return <Redirect href="/(app)" />;
  if (!onboardingSeen) return <Redirect href="/onboarding" />;
  return <Redirect href="/(auth)/login" />;
}
