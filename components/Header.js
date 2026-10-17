import { memo } from 'react';
import { View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SegmentedSwitch from './SegmentedSwitch';
import { HamburgerIcon, WalletIcon } from './icons';

// The Expense/Income switch: the same sliding-pill switch the Add Transaction
// sheet uses, so choosing which one you're looking at works the way choosing which
// one you're adding does. `mode` is still owned by index.js and never persisted.
const MODE_OPTIONS = [
  { id: 'expense', label: 'Expense' },
  { id: 'income', label: 'Income' },
];

// `light` is a one-off experimental prop for trying a light theme on just
// the Dashboard — not a real app-wide theme system, so it's threaded
// through as a plain prop rather than a context. Every other screen keeps
// passing nothing (defaults to the normal dark look).
function Header({ onMenuOpen, onCalendarOpen, mode, onSelectMode, light = false }) {
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

      {/* Same width on both side buttons (w-9) is what centres this
          perfectly via justify-between, with no absolute positioning
          needed — see the row's own layout math. */}
      <SegmentedSwitch options={MODE_OPTIONS} value={mode} onChange={onSelectMode} buttonWidth={84} light={light} />

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
