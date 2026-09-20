import { Platform, StyleSheet, View } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import Animated, { useAnimatedProps, useAnimatedStyle } from 'react-native-reanimated';

// The blur is expo-blur's, on iOS. Its native half exists only in a dev client
// built after the package was added, and merely importing it in an older one
// fails, so it is loaded only once the native module is really there; until
// then (and on Android, where the app dropped blur for looking muddy — see
// Glass.js) the backdrop is the plain dark tint alone.
const BlurView = Platform.OS === 'ios' && requireOptionalNativeModule('ExpoBlurView') ? require('expo-blur').BlurView : null;
const AnimatedBlurView = BlurView ? Animated.createAnimatedComponent(BlurView) : null;

// The most expo-blur allows, on iOS's thickest dark material — the heaviest
// blur it has.
const BLUR_INTENSITY = 100;
// Laid over the blur, on top of the darkness the material already has. Heavy on
// purpose: behind an alert the page should be all but gone, just a soft shape.
const BLURRED_DIM = 0.6;
// The tint on its own, when there is no blur to help (Android, or a dev client
// built before expo-blur): dark enough that the page is hardly legible, though
// not solid black.
const FLAT_DIM = 0.8;

// What sits behind an alert or popup: the page blurred and darkened until
// there is hardly anything left of it to read. `progress` is
// the dialog's own 0..1 open value, so it fades in and out with it. It fades the
// blur by its strength rather than by opacity — a native blur inside a
// half-transparent view stops blurring and goes flat until it is opaque again.
// It ignores touches; the caller lays its own dismiss target over it.
export function DialogBackdrop({ progress }) {
  const blurProps = useAnimatedProps(() => ({ intensity: progress.value * BLUR_INTENSITY }));
  const tintStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {AnimatedBlurView && <AnimatedBlurView tint="systemThickMaterialDark" intensity={0} animatedProps={blurProps} style={StyleSheet.absoluteFill} />}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${BlurView ? BLURRED_DIM : FLAT_DIM})` }, tintStyle]} />
    </View>
  );
}
