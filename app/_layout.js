import '../global.css';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
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

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0a0a0a' } }} />
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
