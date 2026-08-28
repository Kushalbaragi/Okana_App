import { useEffect } from 'react';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSequence, Easing } from 'react-native-reanimated';
import { useAudioPlayer } from 'expo-audio';
import { CheckIcon } from './icons';

const SIZE = 64;
const ICON_SIZE = 28;
const SUCCESS_SOUND = require('../assets/sounds/success.wav');

// Canonical "something just succeeded" badge — same circle, color, and
// bounce-in used everywhere the app confirms a completed action (payment,
// budget set, account changes, onboarding steps). Mount this fresh each
// time (conditional render, not a visibility toggle) so the bounce replays.
// The ding (`playSound`) is opt-in, deliberately reserved for the two
// moments that most deserve it — account creation and payment success —
// rather than firing on every minor confirmation (budget set, account
// erase/delete, cancel-subscription) this badge also appears for.
export function SuccessBadge({ size = SIZE, iconSize = ICON_SIZE, style, playSound = false }) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.6);
  const player = useAudioPlayer(SUCCESS_SOUND);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) });
    scale.value = withSequence(
      withTiming(1.15, { duration: 380, easing: Easing.out(Easing.back(1.4)) }),
      withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }),
    );
    if (playSound) {
      player.seekTo(0);
      player.play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(74,222,128,0.12)',
          borderWidth: 1,
          borderColor: 'rgba(74,222,128,0.3)',
        },
        animStyle,
        style,
      ]}
    >
      <CheckIcon size={iconSize} />
    </Animated.View>
  );
}
