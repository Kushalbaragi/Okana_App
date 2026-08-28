import { memo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { HamburgerIcon, CalendarIcon } from './icons';
import { PILL_ACTIVE_COLOR } from './Glass';

const BTN_W = 88; // a hair under the original 92 — "Overview" still fits at text-base
const PAD   = 2;
const TABS  = ['expense', 'income', 'overview'];
// Matches the springy, slightly-overshooting snap of iOS's native segmented
// control / Control Center sliders — low mass + moderate damping so the
// pill briefly overshoots the target before settling, rather than the
// eased glide a withTiming curve produces.
const PILL_SPRING = { damping: 18, stiffness: 220, mass: 0.5 };

function ChartTabToggle({ value, onChange }) {
  const idx = TABS.indexOf(value);

  // transform-based rather than animating `left` directly — runs on the
  // compositor instead of the layout thread.
  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: withSpring(idx * BTN_W, PILL_SPRING) }],
  }));

  return (
    <View
      className="flex-row rounded-full"
      style={{ width: BTN_W * 3 + PAD * 2, padding: PAD, backgroundColor: '#161616' }}
    >
      <Animated.View
        style={[
          { position: 'absolute', top: PAD, bottom: PAD, left: PAD, width: BTN_W, borderRadius: 999, backgroundColor: PILL_ACTIVE_COLOR },
          pillStyle,
        ]}
      />
      {TABS.map(tab => (
        <Pressable
          key={tab}
          onPress={() => onChange(tab)}
          style={{ width: BTN_W }}
          className="py-[5px] items-center"
        >
          <Text
            className={value === tab ? 'text-white text-base font-medium' : 'text-white/35 text-base font-medium'}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function Header({ onMenuOpen, chartTab, onChartTabChange, onCalendarOpen }) {
  // Safe-area-aware — a fixed pt-6 isn't enough clearance under the status
  // bar / notch / Dynamic Island on real devices (fine in the web preview,
  // which has no such concept, but overlapped the status bar on-device).
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-row items-center justify-between pb-5 px-5" style={{ paddingTop: insets.top + 16 }}>
      <Pressable onPress={onMenuOpen} className="w-9 h-9 items-center justify-center rounded-xl">
        <HamburgerIcon />
      </Pressable>

      <ChartTabToggle value={chartTab} onChange={onChartTabChange} />

      <Pressable onPress={onCalendarOpen} className="w-9 h-9 items-center justify-center rounded-xl">
        <CalendarIcon />
      </Pressable>
    </View>
  );
}

export default memo(Header);
