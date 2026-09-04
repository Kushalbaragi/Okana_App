import { useEffect } from 'react';
import { View, Text } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { AnimatedModal } from './AnimatedModal';
import { SuccessBadge } from './SuccessBadge';

const DEFAULT_HOLD_MS = 3000;

// One continuous popup covering an in-progress action and its outcome — a
// fill bar while working, then either the shared SuccessBadge + message, or
// (for an outcome that was never confirmed one way or the other, e.g.
// backing out of the App/Play Store without actually cancelling) a plain
// neutral message with no badge at all, rather than claiming a success that
// didn't happen. The bar fills toward ~92% over roughly `workingDurationMs`
// so it reads as "still going" rather than claiming a precision it doesn't
// have, then snaps the rest of the way to 100% once `phase` leaves
// 'working'. `children` renders below the success message — used for
// anything extra the caller needs to show there (a warning, a follow-up
// button, etc.).
export function ActionOverlay({
  phase, // 'working' | 'success' | 'notConfirmed'
  workingText,
  workingSubtext = 'This will just take a moment',
  workingDurationMs = 3600,
  successText,
  notConfirmedText,
  notConfirmedSubtext,
  holdMs = DEFAULT_HOLD_MS,
  onDone,
  children,
  light = false,
}) {
  const fillProgress = useSharedValue(0);

  useEffect(() => {
    if (phase === 'working') {
      fillProgress.value = withTiming(0.92, { duration: workingDurationMs, easing: Easing.out(Easing.cubic) });
    } else {
      fillProgress.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) });
    }
  }, [phase, fillProgress, workingDurationMs]);

  useEffect(() => {
    if (phase === 'working' || !onDone) return;
    const t = setTimeout(onDone, holdMs);
    return () => clearTimeout(t);
  }, [phase, onDone, holdMs]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${fillProgress.value * 100}%` }));

  return (
    // A dimmer, light-mode scrim (same value AddModal already uses behind
    // its own light-mode sheet) so recolored dark-ink text stays readable —
    // the default dim=1 solid-black backdrop would swallow it otherwise.
    <AnimatedModal open onClose={() => {}} variant="center" dim={light ? 0.4 : 1}>
      <View className="items-center" style={{ maxWidth: 320 }}>
        {phase === 'working' ? (
          <>
            <View style={{ width: 200, height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)', marginBottom: 20 }}>
              <Animated.View style={[{ height: '100%', borderRadius: 4, backgroundColor: '#4ade80' }, fillStyle]} />
            </View>
            <Text className="font-semibold text-base text-center" style={{ color: light ? '#111111' : '#ffffff' }}>{workingText}</Text>
            <Text className="text-base mt-1 text-center" style={{ color: light ? 'rgba(0,0,0,0.40)' : 'rgba(255,255,255,0.40)' }}>{workingSubtext}</Text>
          </>
        ) : phase === 'notConfirmed' ? (
          <>
            <Text className="font-semibold text-base text-center" style={{ color: light ? '#111111' : '#ffffff' }}>{notConfirmedText}</Text>
            {!!notConfirmedSubtext && (
              <Text className="text-base mt-1 text-center" style={{ color: light ? 'rgba(0,0,0,0.40)' : 'rgba(255,255,255,0.40)' }}>{notConfirmedSubtext}</Text>
            )}
          </>
        ) : (
          <>
            <SuccessBadge style={{ marginBottom: 20 }} />
            <Text className="font-semibold text-base text-center" style={{ color: light ? '#111111' : '#ffffff' }}>{successText}</Text>
            {children}
          </>
        )}
      </View>
    </AnimatedModal>
  );
}
