import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { SPRING_SMOOTH } from '../utils/motion';
import { textColor } from '../utils/colors';
import { FONT } from '../utils/type';

// The sliding-reel-under-a-fixed-window switch shared by the Home header's
// own Expense/Income/Overview mode switch (see ModeSlider/DimReel in
// Header.js, which still keeps its own copy — three fixed modes wired
// straight to a parent-owned `mode`, closely enough tangled with that
// header's own layout that pulling it in here wasn't worth it) and the Add
// Transaction sheet's Expense/Income toggle, now generalised so Savings'
// own Add/Withdraw toggle (see MoneySheet in SavingsSheets.js) can be a
// third, visually identical caller instead of a differently-styled
// SegmentedSwitch. A dim, always-visible reel underneath (where taps
// actually land), and a solid pill window on top that clips a second
// bright/bold copy of the same labels as it glides between them.
//
// `modes` is the list of ids in order, `labels` maps each to its text.
// Works as-is for 2 or 3 modes — see CONTAINER_WIDTH's own comment.
//
// `slot` (default 72) still spaces every mode's own tap target and
// position evenly — the underlying reel (and its offset maths) needs a
// fixed grid regardless of how long each label is. The bright pill window
// on top no longer just matches that slot width, though: it measures each
// label's own rendered width (via onLayout below) and animates to fit
// snugly around whichever one is active, rather than a box sized for the
// slot itself. A short "Add" and a much longer "Withdraw" then each get a
// pill that actually matches their own text instead of both sharing one
// fixed size — too tight for the long one, or too loose around the short
// one, whichever the fixed size happened to be tuned for.
const DEFAULT_SLOT = 72;
const BOX_PAD_V = 5;
const BOX_PAD_H = 14;
const BASE_TRACK_HEIGHT = 26;
const TRACK_HEIGHT = BASE_TRACK_HEIGHT + BOX_PAD_V * 2;

function indexOffset(i, slot) {
  return -(i * slot + slot / 2);
}

function DimReel({ modes, labels, slot, containerWidth, trackStyle, light, onSelect }) {
  return (
    <Animated.View style={[{ position: 'absolute', left: containerWidth / 2, top: 0, height: '100%', flexDirection: 'row' }, trackStyle]}>
      {modes.map(m => (
        <Pressable key={m} onPress={() => onSelect(m)} style={{ width: slot, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
          <Text numberOfLines={1} style={{ fontSize: FONT.caption, fontWeight: '500', color: textColor(light).disabled, letterSpacing: 0.1 }}>
            {labels[m]}
          </Text>
        </Pressable>
      ))}
    </Animated.View>
  );
}

export function ReelSlider({ modes, labels, value, onSelect, light, slot = DEFAULT_SLOT }) {
  // With the active slot centred, showing its one immediate neighbour in
  // full (not clipped) needs a container at least 3 slots wide, regardless
  // of how many modes actually exist — the maths is the same either way (a
  // container exactly N slots wide only fully shows a neighbour up to
  // (N-1)/2 slots away). At exactly 2 modes, that neighbour would otherwise
  // be clipped by exactly half its own width; padding the container out to
  // 3 slots — with the real modes still centred inside it via the same
  // offset formula — fixes it without changing anything about how many
  // modes there are.
  const containerWidth = slot * 3;
  const offset = useSharedValue(indexOffset(modes.indexOf(value), slot));

  useEffect(() => {
    offset.value = withSpring(indexOffset(modes.indexOf(value), slot), SPRING_SMOOTH);
  }, [value, modes, slot, offset]);

  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));

  // Each label's own rendered width, measured off the exact bright/bold
  // copy the pill window clips around (not the dim reel's own regular-
  // weight copy below, which renders a few px narrower) — keyed by mode so
  // a label that hasn't laid out yet just falls back to the slot's own
  // width for one frame rather than a jarring zero-width pill.
  const [textWidths, setTextWidths] = useState({});
  const measure = (m) => (e) => {
    const w = e.nativeEvent.layout.width;
    setTextWidths(prev => (prev[m] === w ? prev : { ...prev, [m]: w }));
  };
  const activeWidth = textWidths[value] ?? slot;
  const boxWidth = useSharedValue(activeWidth + BOX_PAD_H * 2);

  useEffect(() => {
    boxWidth.value = withSpring(activeWidth + BOX_PAD_H * 2, SPRING_SMOOTH);
  }, [activeWidth, boxWidth]);

  // Both the window's own size/position and the bright reel's anchor point
  // inside it are driven off the same shared `boxWidth` — see the module
  // comment above on why that keeps the bright copy pixel-aligned with the
  // dim reel underneath at any width, not just the one this used to be
  // fixed at.
  const boxStyle = useAnimatedStyle(() => ({
    width: boxWidth.value,
    left: containerWidth / 2 - boxWidth.value / 2,
  }));
  const innerTrackStyle = useAnimatedStyle(() => ({
    left: boxWidth.value / 2,
    transform: [{ translateX: offset.value }],
  }));

  return (
    <View style={{ width: containerWidth, height: TRACK_HEIGHT, overflow: 'hidden' }}>
      <DimReel modes={modes} labels={labels} slot={slot} containerWidth={containerWidth} trackStyle={trackStyle} light={light} onSelect={onSelect} />

      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: 0,
            height: TRACK_HEIGHT,
            borderRadius: TRACK_HEIGHT / 2,
            backgroundColor: light ? '#eeeeec' : '#0f0f0f',
            overflow: 'hidden',
          },
          boxStyle,
        ]}
      >
        <Animated.View style={[{ position: 'absolute', top: 0, height: '100%', flexDirection: 'row' }, innerTrackStyle]}>
          {modes.map(m => (
            <View key={m} style={{ width: slot, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
              {/* Neutral for every mode, active or not — the box itself
                  (position, fill, weight, uppercase) already says which one
                  is selected. onLayout measures this exact rendering (bold,
                  uppercase, this letter-spacing) so the pill fits what's
                  actually drawn, not an estimate from a different style. */}
              <Text
                numberOfLines={1}
                onLayout={measure(m)}
                style={{ fontSize: FONT.caption, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase', color: textColor(light).primary }}
              >
                {labels[m]}
              </Text>
            </View>
          ))}
        </Animated.View>
      </Animated.View>
    </View>
  );
}
