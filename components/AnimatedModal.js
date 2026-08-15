import { useEffect, useState } from 'react';
import { Modal, View, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS } from 'react-native-reanimated';

// Shared fade-backdrop + slide/scale-content shell, extracted from AddModal's
// pattern. RN's built-in Modal animationType only animates the whole modal
// as one transform (backdrop slides with the content, which looks wrong for
// a backdrop) — this drives backdrop opacity and content transform
// independently with Reanimated instead, and keeps the Modal mounted
// through the close animation so it can actually play.
export function AnimatedModal({ open, onClose, variant = 'bottom', blurIntensity = 30, dim = 0.5, children }) {
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const [visible, setVisible] = useState(open);
  const backdropOpacity = useSharedValue(0);
  const progress = useSharedValue(0); // 0 closed → 1 open

  useEffect(() => {
    if (open) {
      setVisible(true);
      backdropOpacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) });
      progress.value = withTiming(1, { duration: 380, easing: Easing.bezier(0.16, 1, 0.3, 1) });
    } else {
      backdropOpacity.value = withTiming(0, { duration: 220, easing: Easing.in(Easing.cubic) });
      progress.value = withTiming(
        0,
        { duration: 220, easing: Easing.in(Easing.cubic) },
        finished => { if (finished) runOnJS(setVisible)(false); },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
  const contentStyle = useAnimatedStyle(() => {
    if (variant === 'bottom') {
      return { transform: [{ translateY: (1 - progress.value) * windowHeight }] };
    }
    // Scale + a settle-in translateY (instead of scale alone) — matches the
    // "digit-up"/ease-out-expo reveal feel used elsewhere in the web app
    // (cubic-bezier(0.16,1,0.3,1)) rather than a flat cross-fade.
    return {
      opacity: progress.value,
      transform: [
        { translateY: (1 - progress.value) * 14 },
        { scale: 0.94 + progress.value * 0.06 },
      ],
    };
  });

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable style={{ flex: 1 }} onPress={onClose}>
          <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
            <BlurView intensity={blurIntensity} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${dim})` }]} />
          </Animated.View>
        </Pressable>

        {variant === 'center' ? (
          <View
            style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }]}
            pointerEvents="box-none"
          >
            <Animated.View style={contentStyle} pointerEvents="auto">
              {/* Plain (non-animated) wrapper with a concrete pixel width —
                  Animated.View above has no definite width of its own here
                  (alignItems:center on the ancestor leaves it shrink-wrapped),
                  so any `w-full` a child asks for can't resolve against it
                  reliably on native Yoga. Putting the width fix on a plain
                  View instead of the Animated.View itself sidesteps a
                  react-native-web + Reanimated quirk where a static style
                  merged into an animated style array doesn't apply. */}
              <View style={{ width: windowWidth - 48, alignItems: 'center' }}>
                {children}
              </View>
            </Animated.View>
          </View>
        ) : (
          <Animated.View style={[{ position: 'absolute', bottom: 0, left: 0, right: 0 }, contentStyle]}>
            {children}
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}
