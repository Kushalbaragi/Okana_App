import { memo, useCallback } from 'react';
import { View, Text } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import { GlassPressable } from './Glass';
import { CheckIcon, ChevronRight } from './icons';
import { SwipeDeleteAction, useSwipeDelete } from './SwipeDeleteAction';
import { Card, ProgressBar, POSITIVE, dim, money } from './savingsShared';
import { textColor } from '../utils/colors';
import { TABULAR, FONT } from '../utils/type';

// When a goal is deleted it fades out and the ones below slide up into its
// place, so the removal is something you see happen.
const REMOVE_MS = 240;

// A goal or loan on the list, as a card of its own, laid out like the budget card
// on the same page: the name on the left in the normal text colour, a quiet figure
// opposite it (what has been saved, or what is still owed), and a thin bar under
// them. Deliberately nothing else — the rest is on its own page.
//
// Swiping it left reveals a delete button, which asks `onDelete` right away (the
// caller confirms — a goal takes its history with it). `registerSwipeable`,
// `onSwipeOpen` and `onCardPress` let the list keep to one open card at a time
// and have a tap that closes one be spent on that; leave them out for a card
// that stands alone.
//
// A finished goal (`done`) is the same card with a tick by the name, dimmer
// name and no figure or bar: it is done, so the list stays quieter for it.
function GoalCard({ goal, onPress, onDelete, registerSwipeable, onSwipeOpen, onCardPress, light = false, done = false }) {
  const { setSwipeableRef, handleDelete } = useSwipeDelete(goal.id, onDelete, registerSwipeable);

  // A tap that closed an open card is spent on that, so it doesn't also open
  // the goal behind the closing swipe.
  const handlePress = useCallback(() => {
    if (onCardPress?.()) return;
    onPress(goal.id);
  }, [goal.id, onPress, onCardPress]);

  const isDebt = goal.kind === 'debt';
  // Savings shows what has been saved; a loan shows what is still owed.
  const figure = isDebt ? goal.remaining : goal.saved;
  const accessibilityLabel = done
    ? `${goal.name}, ${isDebt ? 'cleared' : 'completed'}`
    : `${goal.name}, ${money(figure)} ${isDebt ? 'left' : 'saved'}`;

  const card = (
    <Card light={light}>
      <GlassPressable
        variant="field"
        pressScale={false}
        onPress={handlePress}
        style={{ paddingVertical: 18, paddingHorizontal: 20 }}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {done ? (
          // A tick by a dimmed name. items-center, not items-baseline: an SVG has
          // no text baseline to align to, and Yoga falls back to its height, which
          // pushed the name out of the card's padded box and left a cleared loan
          // showing nothing but a tick.
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <CheckIcon size={14} color={POSITIVE} />
            <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: FONT.body, fontWeight: '400', color: dim(light, 0.5) }}>{goal.name}</Text>
          </View>
        ) : (
          <>
            <View className="flex-row items-baseline justify-between" style={{ gap: 12 }}>
              <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: FONT.body, fontWeight: '400', color: textColor(light).primary }}>{goal.name}</Text>
              {/* Text first, so the row's baseline comes from it, not the icon. */}
              <View className="flex-row items-center" style={{ gap: 4 }}>
                <Text style={{ fontSize: FONT.body, fontWeight: '400', color: textColor(light).tertiary, ...TABULAR }}>{money(figure)} {isDebt ? 'left' : 'saved'}</Text>
                <ChevronRight color={textColor(light).disabled} />
              </View>
            </View>
            <View style={{ marginTop: 12 }}>
              <ProgressBar percent={goal.percent} height={7} light={light} trackColor={dim(light, 0.1)} />
            </View>
          </>
        )}
      </GlassPressable>
    </Card>
  );

  return (
    <Animated.View style={{ marginBottom: 10 }} layout={LinearTransition.duration(REMOVE_MS)} exiting={FadeOut.duration(REMOVE_MS)}>
      {onDelete ? (
        <ReanimatedSwipeable
          ref={setSwipeableRef}
          friction={1.8}
          rightThreshold={32}
          overshootRight={false}
          renderRightActions={(_progress, drag) => <SwipeDeleteAction drag={drag} onDelete={handleDelete} label="Delete goal" />}
          onSwipeableWillOpen={() => onSwipeOpen?.(goal.id)}
        >
          {card}
        </ReanimatedSwipeable>
      ) : card}
    </Animated.View>
  );
}

export default memo(GoalCard);
