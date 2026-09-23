import { memo } from 'react';
import { View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HamburgerIcon, WalletIcon } from './icons';

// Just menu and wallet now — the Expense/Income/Overview segmented pill
// that used to sit between them is the tappable word under the headline
// amount instead (see TypeSwitch in SummaryCard).
//
// `light` is a one-off experimental prop for trying a light theme on just
// the Dashboard — not a real app-wide theme system, so it's threaded
// through as a plain prop rather than a context. Every other screen keeps
// passing nothing (defaults to the normal dark look).
function Header({ onMenuOpen, onCalendarOpen, light = false }) {
  // Safe-area-aware — a fixed pt-6 isn't enough clearance under the status
  // bar / notch / Dynamic Island on real devices (fine in the web preview,
  // which has no such concept, but overlapped the status bar on-device).
  const insets = useSafeAreaInsets();
  const iconColor = light ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.7)';

  return (
    <View className="flex-row items-center justify-between pb-5 px-5" style={{ paddingTop: insets.top + 16 }}>
      <Pressable
        onPress={onMenuOpen}
        className="w-9 h-9 items-center justify-center rounded-xl"
        accessibilityRole="button"
        accessibilityLabel="Open menu"
      >
        <HamburgerIcon color={iconColor} />
      </Pressable>

      <Pressable
        onPress={onCalendarOpen}
        className="w-9 h-9 items-center justify-center rounded-xl"
        accessibilityRole="button"
        accessibilityLabel="Open budget and savings"
      >
        <WalletIcon color={iconColor} />
      </Pressable>
    </View>
  );
}

export default memo(Header);
