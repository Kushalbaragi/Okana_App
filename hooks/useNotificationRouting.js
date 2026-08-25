import { useEffect } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';

// Single app-wide listener for the 5 subscription-lifecycle push
// notifications (trial ending, activated, trial ended, payment failed,
// subscription ended) — each one carries its own `data.route`, so this one
// listener handles every type without per-type client logic.
//
// setNotificationHandler also makes the system banner show even while the
// app is foregrounded, so it's the single UI for these events in every
// app state — no separate in-app toast needed.
export function useNotificationRouting() {
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const Notifications = require('expo-notifications');

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const route = response.notification.request.content.data?.route;
      if (route) router.push(route);
    });

    return () => sub.remove();
  }, []);
}
