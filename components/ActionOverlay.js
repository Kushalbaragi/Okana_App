import { useEffect } from 'react';
import { View, Text } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { AnimatedModal } from './AnimatedModal';
import { SuccessBadge } from './SuccessBadge';

const DEFAULT_HOLD_MS = 3000;

// One continuous popup covering an in-progress action and its success state
// — a fill bar while working, then the shared SuccessBadge + message. Used
// anywhere an action has no real progress signal to report (account
// deletion, data erase, subscription-cancellation confirmation): the bar
// fills toward ~92% over roughly `workingDurationMs` so it reads as "still
// going" rather than claiming a precision it doesn't have, then snaps the
// rest of the way to 100% the instant `phase` flips to 'success'.
// `children` renders below the success message — used for anything extra
// the caller needs to show there (a warning, a follow-up button, etc.).
export function ActionOverlay({
  phase, // 'working' | 'success'
  workingText,
  workingSubtext = 'This will just take a moment',
  workingDurationMs = 3600,
  successText,
  holdMs = DEFAULT_HOLD_MS,
  onDone,
  children,
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
    if (phase !== 'success' || !onDone) return;
    const t = setTimeout(onDone, holdMs);
    return () => clearTimeout(t);
  }, [phase, onDone, holdMs]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${fillProgress.value * 100}%` }));

  return (
    <AnimatedModal open onClose={() => {}} variant="center">
      <View className="items-center" style={{ maxWidth: 320 }}>
        {phase === 'working' ? (
          <>
            <View style={{ width: 200, height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.08)', marginBottom: 20 }}>
              <Animated.View style={[{ height: '100%', borderRadius: 4, backgroundColor: '#4ade80' }, fillStyle]} />
            </View>
            <Text className="text-white font-semibold text-base text-center">{workingText}</Text>
            <Text className="text-white/40 text-base mt-1 text-center">{workingSubtext}</Text>
          </>
        ) : (
          <>
            <SuccessBadge style={{ marginBottom: 20 }} />
            <Text className="text-white font-semibold text-base text-center">{successText}</Text>
            {children}
          </>
        )}
      </View>
    </AnimatedModal>
  );
}
