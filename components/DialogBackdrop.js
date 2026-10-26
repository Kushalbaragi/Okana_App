import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

// What sits behind an alert, popup or sheet: a light dim and no blur, so the page is
// still there but the dialog is what you look at. `progress` is the dialog's own 0..1
// open value, so the dim fades in and out with it. It ignores touches; the caller lays
// its own dismiss target over it.
const DIM = 0.35;

export function DialogBackdrop({ progress }) {
  const style = useAnimatedStyle(() => ({ opacity: progress.value }));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${DIM})` }, style]} />
    </View>
  );
}
