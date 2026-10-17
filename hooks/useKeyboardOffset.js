import { useEffect, useRef } from 'react';
import { Keyboard, Platform } from 'react-native';
import { Easing, useSharedValue, withTiming } from 'react-native-reanimated';

// The keyboard's height as a shared value that eases to each new height, for
// lifting content above it. Tracked by hand rather than with KeyboardAvoidingView:
// moving focus between fields fires a fresh "will show" with the same height, and
// KeyboardAvoidingView visibly re-runs its animation on each one. Here a repeat of
// the height it already has is ignored, and nothing re-renders: the listeners set
// the shared value directly.
export function useKeyboardOffset() {
  const offset = useSharedValue(0);
  const target = useRef(0);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const to = (height) => {
      if (height === target.current) return;
      target.current = height;
      offset.value = withTiming(height, { duration: 250, easing: Easing.out(Easing.cubic) });
    };
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', e => to(e.endCoordinates.height));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => to(0));
    return () => { show.remove(); hide.remove(); };
  }, [offset]);
  return offset;
}
