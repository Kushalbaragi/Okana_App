import { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, Platform, Linking, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS } from 'react-native-reanimated';
import { UpdateIcon, CloseIcon } from './icons';

const SETTLE_EASING = Easing.bezier(0.16, 1, 0.3, 1);
const BACKDROP_MAX_OPACITY = 0.55;
const OPEN_DURATION = 520;
const CLOSE_DURATION = 900;
const CLOSE_EASING = Easing.inOut(Easing.cubic);

// Plain listing page, not the review-writing deep link account.js's rateApp
// uses — itms-apps:// / market:// still open the native store app directly
// where available, falling back to the https listing otherwise.
function openStoreListing() {
  const storeUrl = Platform.OS === 'ios'
    ? 'itms-apps://apps.apple.com/app/id6805307127'
    : 'market://details?id=com.kushalbaragi.okana';
  const webUrl = Platform.OS === 'ios'
    ? 'https://apps.apple.com/app/id6805307127'
    : 'https://play.google.com/store/apps/details?id=com.kushalbaragi.okana';
  Linking.openURL(storeUrl).catch(() => Linking.openURL(webUrl));
}

// A soft, non-blocking update prompt — deliberately dismissible only via
// the close icon, not by tapping the backdrop (see the missing onPress on
// it below) or the OS back button. An update notice a user could brush
// past without noticing isn't worth showing at all.
export function UpdateSheet({ open, onDismiss }) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [visible, setVisible] = useState(open);
  const translateY = useSharedValue(windowHeight);

  useEffect(() => {
    if (open) {
      setVisible(true);
      translateY.value = withTiming(0, { duration: OPEN_DURATION, easing: SETTLE_EASING });
    } else if (visible) {
      translateY.value = withTiming(windowHeight, { duration: CLOSE_DURATION, easing: CLOSE_EASING }, finished => {
        if (finished) runOnJS(setVisible)(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: (1 - Math.min(1, Math.max(0, translateY.value / windowHeight))) * BACKDROP_MAX_OPACITY,
  }));

  if (!visible) return null;

  function handleUpdate() {
    openStoreListing();
    onDismiss();
  }

  return (
    <Modal visible={visible} transparent animationType="none">
      <View style={{ flex: 1 }}>
        {/* No onPress here, on purpose — see the component comment above. */}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000000' }, backdropStyle]} />

        <Animated.View
          style={[
            {
              position: 'absolute', left: 0, right: 0, bottom: 0,
              backgroundColor: '#141414',
              borderTopLeftRadius: 20, borderTopRightRadius: 20,
              paddingHorizontal: 20, paddingTop: 20,
              paddingBottom: insets.bottom + 20,
            },
            sheetStyle,
          ]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <UpdateIcon />
              <Text style={{ fontSize: 16, fontWeight: '500', color: '#ffffff' }}>Update available</Text>
            </View>
            <Pressable onPress={onDismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss">
              <CloseIcon />
            </Pressable>
          </View>

          <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 18 }}>
            A new version of Okana is ready.
          </Text>

          <Pressable
            onPress={handleUpdate}
            style={{ backgroundColor: '#4ade80', alignItems: 'center', paddingVertical: 13, borderRadius: 12 }}
          >
            <Text style={{ fontSize: 14, fontWeight: '500', color: '#08170e' }}>Update now</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}
