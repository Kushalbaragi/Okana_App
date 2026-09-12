import { useSharedValue, useAnimatedStyle, withSequence, withTiming } from 'react-native-reanimated';

// A small horizontal shake — the one bit of "reacting to failure" a plain
// error line/color change doesn't convey on its own. Originally built for
// a wrong OTP code, reused anywhere a field needs to visibly object to an
// invalid submit attempt.
export function useShake() {
  const shakeX = useSharedValue(0);
  function shake() {
    shakeX.value = withSequence(
      withTiming(-8, { duration: 55 }),
      withTiming(8, { duration: 55 }),
      withTiming(-6, { duration: 55 }),
      withTiming(6, { duration: 55 }),
      withTiming(0, { duration: 55 }),
    );
  }
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));
  return { shake, style };
}
