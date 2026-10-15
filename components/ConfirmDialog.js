import { View, Text, Pressable } from 'react-native';
import { AnimatedModal } from './AnimatedModal';
import { POPUP_RADIUS, SMOOTH } from './Glass';
import { textColor } from '../utils/colors';

// The app's confirm dialog: a card with a title, a message and one button, over
// the blurred backdrop. Tapping outside it (or the back button) calls `onCancel`.
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
export default function ConfirmDialog({ open, title, message, confirmLabel, tone = 'danger', icon, onConfirm, onCancel, onClosed, light = false, dim }) {
  const ink = light ? '#111111' : '#ffffff';
  const { bg: confirmBg, color: confirmColor } = TONES[tone] || { bg: light ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)', color: ink };
  const align = icon ? 'center' : 'left';
  return (
    <AnimatedModal open={open} onClose={onCancel} onClosed={onClosed} variant="center" dim={dim}>
      <View
        className={icon ? 'w-full p-6 items-center' : 'w-full p-6'}
        style={{
          maxWidth: 360,
          borderRadius: POPUP_RADIUS,
          ...SMOOTH,
          backgroundColor: light ? 'rgba(250,250,248,0.98)' : 'rgba(20,20,20,0.98)',
          borderWidth: 1,
          borderColor: light ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)',
        }}
      >
        {!!icon && <Text style={{ fontSize: 30 }} className="mb-3">{icon}</Text>}
        <Text className="font-semibold text-base mb-2" style={{ color: ink, textAlign: align }}>{title}</Text>
        <Text className="text-base mb-6" style={{ lineHeight: 22, color: textColor(light).tertiary, textAlign: align }}>{message}</Text>
        <Pressable onPress={onConfirm} className="w-full py-3 rounded-full items-center" style={{ backgroundColor: confirmBg }}>
          <Text className="text-base font-semibold" style={{ color: confirmColor }}>{confirmLabel}</Text>
        </Pressable>
      </View>
    </AnimatedModal>
  );
}
