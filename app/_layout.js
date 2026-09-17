import '../global.css';
import { useEffect } from 'react';
import { View, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { setAudioModeAsync } from 'expo-audio';
import * as Sentry from '@sentry/react-native';
import { PostHogProvider } from 'posthog-react-native';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { NetworkProvider } from '../context/NetworkContext';
import { OfflineBanner } from '../components/OfflineBanner';
import { usePushToken } from '../hooks/usePushToken';
import { useNotificationRouting } from '../hooks/useNotificationRouting';
import { usePurchases } from '../hooks/usePurchases';
import { useAnalyticsIdentity } from '../hooks/useAnalyticsIdentity';
import { useScreenTracking } from '../hooks/useScreenTracking';

// A blank DSN makes Sentry.init a documented no-op (it just logs a warning
// and every later Sentry.* call is silently skipped) — safe for local dev
// before EXPO_PUBLIC_SENTRY_DSN is filled in in .env, no separate "is this
// configured" branch needed anywhere else in the app.
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
  // Development builds are extremely noisy (every Fast Refresh, every dev
  // menu warning) and none of that is signal — only report from release/
  // preview builds, where a captured error actually means something.
  enabled: !__DEV__,
});

function AppShell() {
  const { user } = useAuth();
  usePushToken(user?.id);
  useNotificationRouting();
  usePurchases(user?.id);
  useAnalyticsIdentity(user);
  useScreenTracking();

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

// A plain crash screen instead of the default red box / white screen — a
// render error anywhere below this still ends the session for the user,
// but at least tells them that instead of just going blank. Sentry.
// ErrorBoundary reports the error automatically before showing this.
function CrashFallback() {
  return (
    <View className="flex-1 items-center justify-center px-8" style={{ backgroundColor: '#0a0a0a' }}>
      <Text className="text-white text-lg font-semibold text-center">Something went wrong</Text>
      <Text className="text-center mt-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
        Restart the app to keep going. Your data is safe.
      </Text>
    </View>
  );
}

function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* A blank apiKey makes PostHogProvider a documented no-op — same
          "safe before the env var is filled in" shape as Sentry.init above,
          so there's no separate "is analytics configured" branch needed
          anywhere else. captureScreens/captureTouches are both off:
          expo-router doesn't expose the navigation container autocapture
          needs (see useScreenTracking, which does this manually via the
          router's own pathname instead), and touches are tracked as
          purposeful named events at their call sites rather than raw
          autocaptured taps. captureAppLifecycleEvents is also off — the
          "Application Installed/Opened/Backgrounded" events it sends by
          default were judged more noise than signal; the custom events
          fired throughout the app (useTransactions, useBudget,
          AuthContext, account.js, index.js) already cover what matters. */}
      <PostHogProvider
        apiKey={process.env.EXPO_PUBLIC_POSTHOG_API_KEY}
        options={{
          host: process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
          captureAppLifecycleEvents: false,
        }}
        autocapture={{ captureScreens: false, captureTouches: false }}
      >
        <NetworkProvider>
          <AuthProvider>
            <AppShell />
          </AuthProvider>
        </NetworkProvider>
      </PostHogProvider>
    </GestureHandlerRootView>
  );
}

// Sentry.wrap adds automatic native-crash and startup-time tracking around
// the whole tree; ErrorBoundary catches render-time JS errors specifically
// (a native crash below still fully terminates the app — no JS boundary
// can catch that — but this covers the far more common "a component threw"
// case) and reports them before falling back to CrashFallback above.
export default Sentry.wrap(function WrappedRootLayout() {
  return (
    <Sentry.ErrorBoundary fallback={CrashFallback}>
      <RootLayout />
    </Sentry.ErrorBoundary>
  );
});
