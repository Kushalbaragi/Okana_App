import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';

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
