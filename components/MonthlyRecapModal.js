import { memo, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, useWindowDimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';

const SLIDE_MS = 6000;

const TONE = {
  positive: { ring: '#4ade80', glow: 'rgba(74,222,128,0.16)' },
  neutral:  { ring: 'rgba(255,255,255,0.5)', glow: 'rgba(255,255,255,0.06)' },
  nudge:    { ring: '#fbbf24', glow: 'rgba(251,191,36,0.14)' },
};

function ProgressSegment({ state }) {
  // state: 'done' | 'active' | 'pending'
  const progress = useSharedValue(state === 'done' ? 1 : 0);

  useEffect(() => {
    if (state === 'active') {
      progress.value = 0;
      progress.value = withTiming(1, { duration: SLIDE_MS, easing: Easing.linear });
    } else {
      progress.value = state === 'done' ? 1 : 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const style = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <View className="flex-1 rounded-full overflow-hidden" style={{ height: 3, backgroundColor: 'rgba(255,255,255,0.22)' }}>
      <Animated.View style={[{ height: '100%', backgroundColor: 'white', borderRadius: 999 }, style]} />
    </View>
  );
}

function MonthlyRecapModal({ open, slides, monthLabel, onClose }) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open || !slides.length) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (index >= slides.length - 1) onClose();
      else setIndex(index + 1);
    }, SLIDE_MS);
    return () => clearTimeout(timerRef.current);
  }, [open, index, slides.length, onClose]);

  if (!open || !slides.length) return null;

  const slide = slides[index];
  const tone = TONE[slide.tone] || TONE.neutral;

  function goTo(i) {
    if (i < 0 || i >= slides.length) { onClose(); return; }
    setIndex(i);
  }

  function handleTap(e) {
    const x = e.nativeEvent.locationX;
    if (x < width / 2) goTo(index - 1);
    else goTo(index + 1);
  }

  return (
    <View className="absolute inset-0" style={{ backgroundColor: '#050505', zIndex: 70 }}>
      <View className="flex-row px-3 pt-14" style={{ gap: 6 }}>
        {slides.map((s, i) => (
          <ProgressSegment key={i} state={i < index ? 'done' : i === index ? 'active' : 'pending'} />
        ))}
      </View>

      <View className="flex-row items-center justify-between px-4 pt-3">
        <Text className="text-white/50 text-xs font-semibold tracking-wide">{monthLabel} Recap</Text>
        <Pressable onPress={onClose} className="w-8 h-8 items-center justify-center">
          <Text className="text-white/60 text-lg">✕</Text>
        </Pressable>
      </View>

      <Pressable className="flex-1" onPress={handleTap}>
        <View className="flex-1 items-center justify-center px-8">
          <View
            className="w-16 h-16 rounded-full items-center justify-center mb-6"
            style={{ backgroundColor: tone.glow, borderWidth: 1, borderColor: `${tone.ring}55` }}
          >
            <Text style={{ fontSize: 28 }}>{slide.emoji}</Text>
          </View>
          <Text className="text-white/40 text-xs font-semibold tracking-wider mb-3" style={{ textTransform: 'uppercase' }}>{slide.kicker}</Text>
          <Text className="text-white font-bold tracking-tight mb-3" style={{ fontSize: 44, lineHeight: 52 }}>{slide.value}</Text>
          <Text className="text-white/70 text-base font-medium mb-2 text-center">{slide.headline}</Text>
          <Text className="text-white/45 text-sm text-center" style={{ lineHeight: 20, maxWidth: 280 }}>{slide.message}</Text>
        </View>
      </Pressable>
    </View>
  );
}

export default memo(MonthlyRecapModal);
