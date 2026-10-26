import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedModal } from './AnimatedModal';
import { POPUP_RADIUS, SMOOTH } from './Glass';
import { textColor } from '../utils/colors';

// The app's confirm dialog: a bottom sheet with a title, a message and one button, over
// a light dim. Tapping outside it (or the back button) calls `onCancel`.
// `onClosed` fires only once it has really gone, for a caller that has something
// to do then — the delete confirmations use it to remove what they asked about
// only after the dialog is off the screen, so the removal is seen.
//
// tone 'danger' (default) is for irreversible actions (erase/delete); 'neutral'
// is for a reversible one (logout) that still deserves a confirm tap but
// shouldn't visually read as equally dangerous, or a plain notice ("Got it");
// 'positive' is for a way forward (subscribe). `icon` (an emoji) turns it into a
// centred notice, with the icon above the title.
const TONES = {
  danger: { bg: 'rgba(248,113,113,0.14)', color: 'rgba(248,113,113,0.9)' },
  positive: { bg: 'rgba(74,222,128,0.25)', color: '#4ade80' },
};
export default function ConfirmDialog({ open, title, message, confirmLabel, cancelLabel, tone = 'danger', icon, onConfirm, onCancel, onClosed, light = false, dim }) {
  const ink = light ? '#111111' : '#ffffff';
  const { bg: confirmBg, color: confirmColor } = TONES[tone] || { bg: light ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)', color: ink };
  const align = icon ? 'center' : 'left';
  const insets = useSafeAreaInsets();
  return (
    <AnimatedModal open={open} onClose={onCancel} onClosed={onClosed} variant="bottom" dim={dim}>
      <View
        className={icon ? 'w-full px-6 pt-3 items-center' : 'w-full px-6 pt-3'}
        style={{
          borderTopLeftRadius: POPUP_RADIUS,
          borderTopRightRadius: POPUP_RADIUS,
          ...SMOOTH,
          paddingBottom: insets.bottom + 16,
          backgroundColor: light ? 'rgba(250,250,248,0.98)' : 'rgba(20,20,20,0.98)',
          borderTopWidth: 1,
          borderColor: light ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)',
        }}
      >
        <View style={{ width: 32, height: 4, borderRadius: 2, alignSelf: 'center', backgroundColor: light ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)', marginBottom: 20 }} />
        {!!icon && (
          <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 12, backgroundColor: light ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.1)' }}>
            <Text style={{ fontSize: 22 }}>{icon}</Text>
          </View>
        )}
        <Text className="font-semibold text-base mb-2" style={{ color: ink, textAlign: align }}>{title}</Text>
        <Text className="text-base mb-6" style={{ lineHeight: 22, color: textColor(light).tertiary, textAlign: align }}>{message}</Text>
        <Pressable onPress={onConfirm} className="w-full py-3 rounded-full items-center" style={{ backgroundColor: confirmBg }}>
          <Text className="text-base font-semibold" style={{ color: confirmColor }}>{confirmLabel}</Text>
        </Pressable>
        {!!cancelLabel && (
          <Pressable onPress={onCancel} hitSlop={8} className="pt-4 pb-1">
            <Text className="text-base" style={{ color: textColor(light).tertiary }}>{cancelLabel}</Text>
          </Pressable>
        )}
      </View>
    </AnimatedModal>
  );
}
