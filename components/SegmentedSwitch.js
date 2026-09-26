import { memo } from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { PILL_ACTIVE_COLOR } from './Glass';
import { textColor } from '../utils/colors';
import { SPRING_QUICK } from '../utils/motion';

const PAD = 2;

// A pill-shaped switch between a few fixed options — the same look and
// motion as Header's Expense/Income/Overview toggle, made generic. Each
// button is a fixed width so the sliding pill's position is just
// index * width, done as a transform (compositor, not layout).
function SegmentedSwitch({ options, value, onChange, buttonWidth = 88, trackColor = '#161616', light = false }) {
  const idx = Math.max(0, options.findIndex(o => o.id === value));

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: withSpring(idx * buttonWidth, SPRING_QUICK) }],
  }));

  return (
    <View
      className="flex-row rounded-full"
      style={{ width: buttonWidth * options.length + PAD * 2, padding: PAD, backgroundColor: light ? '#EFEFED' : trackColor }}
    >
      <Animated.View
        style={[
          { position: 'absolute', top: PAD, bottom: PAD, left: PAD, width: buttonWidth, borderRadius: 999, backgroundColor: PILL_ACTIVE_COLOR },
          pillStyle,
        ]}
      />
      {options.map(opt => (
        <Pressable
          key={opt.id}
          onPress={() => onChange(opt.id)}
          style={{ width: buttonWidth }}
          className="py-[5px] items-center"
          accessibilityRole="button"
          accessibilityState={{ selected: value === opt.id }}
        >
          <Text
            className="text-base font-medium"
            style={{ color: value === opt.id ? '#ffffff' : textColor(light).disabled }}
          >
            {opt.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export default memo(SegmentedSwitch);
