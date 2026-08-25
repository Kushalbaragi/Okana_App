import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { useNetwork } from '../context/NetworkContext';

const SETTLE_EASING = Easing.bezier(0.16, 1, 0.3, 1);

const COPY = {
  offline: { text: "You're offline", color: 'rgba(255,255,255,0.55)' },
  online:  { text: "You're back online", color: '#4ade80' },
};

// Sits above the whole app (rendered in app/_layout.js, outside the Stack)
// so it's visible regardless of which screen — including auth/onboarding.
// Purely reactive to `banner` from NetworkContext — there's no ambient
// "you're offline" state here, this only shows for the fixed duration
// triggered by notifyOffline() (an actual attempt that needed the
// network), and its "you're online" follow-up only if that happened.
export function OfflineBanner() {
  const { banner } = useNetwork();
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);

  // `banner` flips to null the instant its timer expires, but the fade-out
  // animation still has 320ms left to play — without this, the text would
  // swap (or go blank) mid-fade instead of the old copy visibly settling
  // out.
  const [lastKind, setLastKind] = useState('offline');
  useEffect(() => {
    if (banner) setLastKind(banner);
  }, [banner]);

  useEffect(() => {
    progress.value = withTiming(banner ? 1 : 0, { duration: 320, easing: SETTLE_EASING });
  }, [banner]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * -28 }],
  }));

  const copy = COPY[lastKind];

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          paddingTop: insets.top + 6,
          paddingBottom: 8,
          alignItems: 'center',
          backgroundColor: '#1c1c1c',
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(255,255,255,0.08)',
        },
        style,
      ]}
    >
      <Text style={{ color: copy.color, fontSize: 12.5, fontWeight: '600' }}>
        {copy.text}
      </Text>
    </Animated.View>
  );
}
