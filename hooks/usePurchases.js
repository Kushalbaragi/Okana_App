import { useCallback, useEffect, useRef } from 'react';
import { Linking, Platform } from 'react-native';

const API_KEY = Platform.select({
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
});

// Configures RevenueCat once a user is signed in, using the Supabase user
// id as RevenueCat's own appUserID — revenuecat-webhook's event.app_user_id
// lookup already assumes this equality.
//
// react-native-purchases is native-only (it falls back to a JS-mocked
// "Preview API Mode" under Expo Go so the app doesn't crash, but real
// purchases need a dev build) — guarded the same way usePushToken.js is,
// so the web preview never touches it.
export function usePurchases(userId) {
  const configuredForRef = useRef(null);

  useEffect(() => {
    if (Platform.OS === 'web' || !userId || configuredForRef.current === userId) return;
    if (!API_KEY) return;

    try {
      const Purchases = require('react-native-purchases').default;
      Purchases.configure({ apiKey: API_KEY, appUserID: userId });
      configuredForRef.current = userId;
    } catch (err) {
      // Fail quietly rather than crashing the app root — e.g. a malformed
      // key, or the native module genuinely unavailable in this environment.
      console.error('RevenueCat configure failed', err);
    }
  }, [userId]);

  const getOfferings = useCallback(async () => {
    if (Platform.OS === 'web') return { success: false, error: 'Not available on this platform yet' };
    try {
      const Purchases = require('react-native-purchases').default;
      const offerings = await Purchases.getOfferings();
      return { success: true, offering: offerings.current };
    } catch (err) {
      return { success: false, error: err.message || 'Could not load subscription options.' };
    }
  }, []);

  const purchasePackage = useCallback(async (pkg) => {
    if (Platform.OS === 'web') return { success: false, error: 'Not available on this platform yet' };
    try {
      const Purchases = require('react-native-purchases').default;
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      return { success: true, customerInfo };
    } catch (err) {
      if (err.userCancelled) return { success: false, cancelled: true };
      return { success: false, error: err.message || 'Purchase failed. Please try again.' };
    }
  }, []);

  const restorePurchases = useCallback(async () => {
    if (Platform.OS === 'web') return { success: false, error: 'Not available on this platform yet' };
    try {
      const Purchases = require('react-native-purchases').default;
      const customerInfo = await Purchases.restorePurchases();
      return { success: true, customerInfo };
    } catch (err) {
      return { success: false, error: err.message || 'Could not restore purchases.' };
    }
  }, []);

  return { getOfferings, purchasePackage, restorePurchases };
}

// Neither the App Store nor Play Store gives an app a way to cancel a
// subscription or read its payment method on the user's behalf — that only
// happens on-device. This just opens the OS's own subscription management
// screen instead of pretending to offer an in-app cancel flow. Shared
// between the Subscription page and the account-deletion warning.
//
// RevenueCat's showManageSubscriptions() opens the native sheet scoped to
// this specific subscription (App Store's "Edit Subscription" for Okana
// directly) rather than the generic itms-apps:// URL, which only ever
// opens the full list of every subscription on the account — there's no
// public URL scheme that deep-links to one app's page on iOS. Falls back
// to that generic list if the native call fails for any reason (Expo Go's
// mocked module, iOS <13, or a device where it's genuinely unsupported),
// so this still lands somewhere useful either way.
export async function openManageSubscription() {
  try {
    const Purchases = require('react-native-purchases').default;
    await Purchases.showManageSubscriptions();
    return;
  } catch {
    // fall through to the generic list below
  }
  if (Platform.OS === 'ios') Linking.openURL('itms-apps://apps.apple.com/account/subscriptions');
  else if (Platform.OS === 'android') Linking.openURL('https://play.google.com/store/account/subscriptions');
}
