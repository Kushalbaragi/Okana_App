import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS } from 'react-native-reanimated';
import { POPUP_RADIUS, SMOOTH } from './Glass';
import { DialogBackdrop } from './DialogBackdrop';
import { SETTLE_EASING } from '../utils/motion';

const OPEN_MS = 220;
const CLOSE_MS = 160;

// The app's confirm dialog (same card, copy style and buttons as the
// ConfirmModal on the account screen), but drawn inside its parent instead of
// in its own native <Modal> — the savings page is already a Modal, and a
// second one on top of it is broken on Android (see InlineSheet). Fills the
// parent, so render it as the last child to sit above everything, sheets
// included.
//
// `error` shows a line under the message and leaves the dialog open, for a
// confirm that was refused; `busy` stops a second tap while one is in flight.
export function InlineConfirm({ open, title, message, confirmLabel = 'Delete', error, busy = false, onConfirm, onCancel, onClosed, light = false }) {
  const [visible, setVisible] = useState(open);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (open) {
      setVisible(true);
      progress.value = withTiming(1, { duration: OPEN_MS, easing: SETTLE_EASING });
    } else {
      progress.value = withTiming(0, { duration: CLOSE_MS, easing: Easing.in(Easing.cubic) }, finished => {
        if (!finished) return;
        runOnJS(setVisible)(false);
        // Only once it is really gone, for a caller that has something to do
        // then (delete what it was asking about, so it is seen to go).
        if (onClosed) runOnJS(onClosed)();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The same small rise and scale the app's centred dialogs use.
  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 14 }, { scale: 0.94 + progress.value * 0.06 }],
  }));

  if (!visible) return null;

  const text = light ? '#111111' : '#ffffff';
  return (
    <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }]} pointerEvents={open ? 'auto' : 'none'}>
      <DialogBackdrop progress={progress} />
      <Pressable style={StyleSheet.absoluteFill} onPress={busy ? undefined : onCancel} accessibilityLabel="Cancel" />

      <Animated.View
        style={[
          {
            width: '100%', maxWidth: 360, borderRadius: POPUP_RADIUS, ...SMOOTH, padding: 24,
            backgroundColor: light ? 'rgba(250,250,248,0.98)' : 'rgba(20,20,20,0.98)',
            borderWidth: 1, borderColor: light ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)',
          },
          cardStyle,
        ]}
      >
        <Text className="font-semibold text-base" style={{ color: text, marginBottom: 8 }}>{title}</Text>
        <Text className="text-base" style={{ lineHeight: 22, color: light ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', marginBottom: error ? 12 : 24 }}>{message}</Text>
        {!!error && <Text className="text-base" style={{ color: '#f87171', marginBottom: 20 }}>{error}</Text>}
        <Pressable
          onPress={onConfirm}
          disabled={busy}
          style={{ width: '100%', paddingVertical: 12, borderRadius: 9999, alignItems: 'center', backgroundColor: 'rgba(248,113,113,0.14)', opacity: busy ? 0.6 : 1 }}
          accessibilityRole="button"
        >
          <Text className="text-base font-semibold" style={{ color: 'rgba(248,113,113,0.9)' }}>{confirmLabel}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}
