import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS } from 'react-native-reanimated';
import { DialogBackdrop } from './DialogBackdrop';
import { SETTLE_EASING } from '../utils/motion';
import { CheckIcon, CloseIcon } from './icons';
import { FONT } from '../utils/type';

const OPEN_MS = 220;
const CLOSE_MS = 160;
// How far below its resting spot the pill starts from (and retreats back
// to) — a bottom sheet's own slide distance, not the small few-pixel rise a
// centred dialog uses.
const SLIDE_DISTANCE = 80;

// A compact yes/no ask: one line of text with a check and an X at the end,
// instead of InlineConfirm's title+message+stacked-buttons card — for a
// prompt that's genuinely just "add this?" (see WalletPage's and
// SavingsSection's own confirm-to-expense prompts). Exactly two outcomes,
// both real actions (not "cancel vs. do the thing") — the check answers
// yes, the X (and the backdrop, for the same answer with one less tap)
// answers no. There's no third "abort, nothing happens" path here, unlike
// InlineConfirm's delete confirmations — see the callers for why "no"
// already means something on its own.
//
// Sits at the bottom and slides up into place, rather than fading in at the
// centre — the same slot (and the same slide) the follow-up "added to your
// expenses" toast uses once this closes, so answering reads as one pill
// handing off to the next rather than two unrelated popups in different
// spots.
export function ConfirmPill({ open, message, onConfirm, onDecline, onClosed, light = false }) {
  const insets = useSafeAreaInsets();
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
        if (onClosed) runOnJS(onClosed)();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * SLIDE_DISTANCE }],
  }));

  if (!visible) return null;

  return (
    <View
      style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 24, paddingBottom: insets.bottom + 24 }]}
      pointerEvents={open ? 'auto' : 'none'}
    >
      <DialogBackdrop progress={progress} />
      {/* Same answer as the X, one less tap — there's nothing for a plain
          dismiss to mean here (see the comment above). */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onDecline} accessibilityLabel="No" />

      <Animated.View
        style={[
          {
            flexDirection: 'row', alignItems: 'center', width: '100%', maxWidth: 380, gap: 12,
            borderRadius: 9999, paddingVertical: 16, paddingHorizontal: 18,
            backgroundColor: light ? 'rgba(250,250,248,0.98)' : 'rgba(20,20,20,0.98)',
            borderWidth: 1, borderColor: light ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)',
          },
          cardStyle,
        ]}
      >
        <Text numberOfLines={2} style={{ flex: 1, fontSize: FONT.caption, lineHeight: 19, color: light ? '#111111' : '#ffffff' }}>{message}</Text>
        <Pressable
          onPress={onConfirm}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Yes"
          style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(74,222,128,0.16)' }}
        >
          <CheckIcon size={16} color="#4ade80" />
        </Pressable>
        <Pressable
          onPress={onDecline}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="No"
          style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(248,113,113,0.14)' }}
        >
          <CloseIcon size={13} color="rgba(248,113,113,0.9)" />
        </Pressable>
      </Animated.View>
    </View>
  );
}
