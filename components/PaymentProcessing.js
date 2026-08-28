import { useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { SuccessBadge } from './SuccessBadge';

// Same "settle" ease-out-expo feel used throughout the app's onboarding/
// reveal sequences (see welcome.js) — keeps this reading as the same motion
// language rather than a one-off effect.
const SETTLE_EASING = Easing.bezier(0.16, 1, 0.3, 1);
const SUCCESS_HOLD_MS = 3000;
// How far above true screen-center the coin sits while it's still grouped
// with the two labels below it — animated back to 0 once those labels are
// gone, so the coin visibly settles into the center rather than jump-cutting.
const COIN_CENTER_OFFSET = -56;

function FadeIn({ delay, duration = 450, distance = 8, style, children }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration, easing: SETTLE_EASING }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const aStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * distance }],
  }));
  return <Animated.View style={[style, aStyle]}>{children}</Animated.View>;
}

// Full-screen "processing → success" sequence shown while a native purchase
// is confirming — reuses the coin image and checkmark bounce already
// established in welcome.js's TickPopup, just choreographed as its own
// standalone takeover screen. `succeeded` flips from false to true once the
// caller has confirmed the webhook's write actually landed; everything from
// there (labels fade out, coin settles to center and fades, checkmark pops
// in, message reveals) plays on its own and calls `onDone` once the success
// state has held for SUCCESS_HOLD_MS.
export function PaymentProcessing({ succeeded, successMessage = 'Payment is successful', onDone }) {
  const [showLabels, setShowLabels] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);

  const coinOpacity = useSharedValue(0);
  const coinScale = useSharedValue(0.85);
  const coinTranslateY = useSharedValue(COIN_CENTER_OFFSET);
  const labelsOpacity = useSharedValue(1);

  useEffect(() => {
    coinOpacity.value = withTiming(1, { duration: 500, easing: SETTLE_EASING });
    // Settles in to full size, then breathes — a smooth, gentle scale in/out
    // pulse (reverse:true auto-reverses back to 1 each cycle) instead of a
    // continuous spin.
    coinScale.value = withSequence(
      withTiming(1, { duration: 500, easing: SETTLE_EASING }),
      withRepeat(withTiming(1.1, { duration: 900, easing: SETTLE_EASING }), -1, true),
    );
  }, []);

  const startedRef = useRef(false);
  useEffect(() => {
    if (!succeeded || startedRef.current) return;
    startedRef.current = true;

    cancelAnimation(coinScale);
    coinScale.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.cubic) });
    labelsOpacity.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });

    const LABELS_FADE_MS = 320;
    const COIN_SETTLE_MS = 500;
    const COIN_FADE_MS = 400;

    const t1 = setTimeout(() => {
      setShowLabels(false);
      coinTranslateY.value = withTiming(0, { duration: COIN_SETTLE_MS, easing: SETTLE_EASING });
      coinOpacity.value = withDelay(150, withTiming(0, { duration: COIN_FADE_MS, easing: Easing.out(Easing.cubic) }));
    }, LABELS_FADE_MS);

    const successAt = LABELS_FADE_MS + 150 + COIN_FADE_MS;
    const t2 = setTimeout(() => setShowSuccess(true), successAt);
    const t3 = setTimeout(onDone, successAt + 350 + SUCCESS_HOLD_MS);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [succeeded]);

  const coinStyle = useAnimatedStyle(() => ({
    opacity: coinOpacity.value,
    transform: [
      { translateY: coinTranslateY.value },
      { scale: coinScale.value },
    ],
  }));
  const labelsStyle = useAnimatedStyle(() => ({ opacity: labelsOpacity.value }));

  return (
    <View style={{ flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
      {!showSuccess && (
        <Animated.Image
          source={require('../assets/coin.png')}
          style={[{ width: 64, height: 64, marginBottom: showLabels ? 14 : 0 }, coinStyle]}
          resizeMode="contain"
        />
      )}
      {showLabels && (
        <Animated.View style={labelsStyle}>
          <FadeIn delay={300} duration={450}>
            <Text style={{ color: '#4ade80', fontSize: 16, fontWeight: '600', textAlign: 'center' }}>Processing Payment</Text>
          </FadeIn>
          <FadeIn delay={550} duration={450}>
            <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: '600', letterSpacing: 1, marginTop: 6, textAlign: 'center' }}>HOLD ON</Text>
          </FadeIn>
        </Animated.View>
      )}
      {showSuccess && (
        <>
          <SuccessBadge style={{ marginBottom: 18 }} />
          <FadeIn delay={350} duration={450} distance={10}>
            <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '500', textAlign: 'center' }}>{successMessage}</Text>
          </FadeIn>
        </>
      )}
    </View>
  );
}
