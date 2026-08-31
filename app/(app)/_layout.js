import { Redirect, Stack } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '../../context/AuthContext';

export default function AppLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator color="#ffffff" />
      </View>
    );
  }

  if (!user) return <Redirect href="/(auth)/login" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Opened from the hamburger icon, not a forward drill-down — slides
          in from the left to read as a side menu, unlike every other
          pushed screen here (subscription, etc.) which keeps the default
          slide-from-right. */}
      <Stack.Screen name="account" options={{ animation: 'slide_from_left' }} />
    </Stack>
  );
}
