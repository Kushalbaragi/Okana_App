import { memo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { HamburgerIcon, CalendarIcon } from './icons';

const BTN_W = 92; // fits "Overview" at text-base, matching the app-wide font-size pass
const PAD   = 3;
const TABS  = ['expense', 'income', 'overview'];

function ChartTabToggle({ value, onChange }) {
  const idx = TABS.indexOf(value);

  const pillStyle = useAnimatedStyle(() => ({
    left: withTiming(PAD + idx * BTN_W, { duration: 220 }),
  }));

  return (
    <View
      className="flex-row rounded-full"
      style={{ width: BTN_W * 3 + PAD * 2, padding: PAD, backgroundColor: 'rgba(255,255,255,0.07)' }}
    >
      <Animated.View
        style={[
          { position: 'absolute', top: 3, bottom: 3, width: BTN_W, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)' },
          pillStyle,
        ]}
      />
      {TABS.map(tab => (
        <Pressable
          key={tab}
          onPress={() => onChange(tab)}
          style={{ width: BTN_W }}
          className="py-[6px] items-center"
        >
          <Text className={value === tab ? 'text-white text-base font-medium' : 'text-white/35 text-base font-medium'}>
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
    <View className="flex-row items-center justify-between pb-3 px-5" style={{ paddingTop: insets.top + 12 }}>
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
