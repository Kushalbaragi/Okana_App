import { useEffect, useRef } from 'react';
import { usePathname } from 'expo-router';
import { usePostHog } from 'posthog-react-native';

// PostHog's own autocapture screen tracking needs a React Navigation
// container ref it doesn't get to see through expo-router — the library's
// own docs call this out and point at doing it manually off the router's
// pathname instead (see PostHogProvider's autocapture={{captureScreens:
// false}} in app/_layout.js). One `posthog.screen()` call per distinct
// pathname is the whole of it; the ref just skips a duplicate fire on a
// re-render that didn't actually change route.
export function useScreenTracking() {
  const posthog = usePostHog();
  const pathname = usePathname();
  const lastPathRef = useRef(null);

  useEffect(() => {
    if (!posthog || !pathname || lastPathRef.current === pathname) return;
    lastPathRef.current = pathname;
    posthog.screen(pathname);
  }, [posthog, pathname]);
}
