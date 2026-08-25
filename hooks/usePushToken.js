import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';

// Registers this device for push notifications once a user is signed in,
// and upserts the token into `push_tokens` (onConflict: token, so the same
// physical device re-registering under a different account reassigns
// ownership instead of erroring on the unique constraint).
//
// expo-notifications is native-only — guarded the same way haptics.js is,
// so the web preview (`expo start --web`) never touches an API that
// doesn't exist there.
export function usePushToken(userId) {
  const registeredForRef = useRef(null);

  useEffect(() => {
    if (Platform.OS === 'web' || !userId || registeredForRef.current === userId) return;

    let cancelled = false;

    (async () => {
      // Requires an EAS project ID (app.json's extra.eas.projectId, set by
      // `eas init`) — until that's linked, there's nothing to register yet.
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) return;

      const Notifications = require('expo-notifications');

      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;
      if (existing !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') return;

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }

      const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
      if (cancelled || !token) return;

      await supabase.from('push_tokens').upsert(
        { token, user_id: userId, platform: Platform.OS, updated_at: new Date().toISOString() },
        { onConflict: 'token' },
      );
      registeredForRef.current = userId;
    })().catch(err => console.error('usePushToken registration failed', err));

    return () => { cancelled = true; };
  }, [userId]);
}
