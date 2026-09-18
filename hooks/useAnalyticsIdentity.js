import { useEffect, useRef } from 'react';
import { usePostHog } from 'posthog-react-native';

// Ties PostHog's anonymous pre-login event stream to a real person once one
// signs in, and cuts that tie back on logout — same "identify on sign-in,
// reset on sign-out" shape used by every other per-user integration in this
// app (RevenueCat in usePurchases.js, push tokens in usePushToken.js).
// Without the reset, a second account signing in on the same device (or the
// same account after a logout/login) would keep getting attributed to
// whoever was last identified.
export function useAnalyticsIdentity(user) {
  const posthog = usePostHog();
  const identifiedForRef = useRef(null);

  useEffect(() => {
    if (!posthog) return;

    if (user) {
      if (identifiedForRef.current === user.id) return;
      posthog.identify(user.id);
      identifiedForRef.current = user.id;
    } else if (identifiedForRef.current) {
      posthog.reset();
      identifiedForRef.current = null;
    }
  }, [posthog, user]);
}
