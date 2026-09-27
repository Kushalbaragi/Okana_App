import { memo, useCallback } from 'react';
import { View, Text } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import { GlassPressable } from './Glass';
import { CheckIcon, ChevronRight } from './icons';
import { SwipeDeleteAction, useSwipeDelete } from './SwipeDeleteAction';
import { Card, ProgressBar, POSITIVE, dim, money } from './savingsShared';
import { textColor } from '../utils/colors';
import { TABULAR } from '../utils/type';

// When a goal is deleted it fades out and the ones below slide up into its
// place, so the removal is something you see happen.
const REMOVE_MS = 240;

// A goal on the list, as a card of its own: the name with its percent and the
// arrow that says it opens, the amount saved as the big number with "of goal"
// beside it, then a plain bar. Deliberately nothing else — the rest is on the
// goal's own page.
//
// Swiping it left reveals a delete button, which asks `onDelete` right away (the
// caller confirms — a goal takes its history with it). `registerSwipeable`,
// `onSwipeOpen` and `onCardPress` let the list keep to one open card at a time
// and have a tap that closes one be spent on that; leave them out for a card
// that stands alone.
//
// A finished goal (`done`) is the same card with a tick by the name, dimmer
// figures and no bar: it is done, so the list stays quieter for it.
function GoalCard({ goal, onPress, onDelete, registerSwipeable, onSwipeOpen, onCardPress, light = false, done = false }) {
  const { setSwipeableRef, handleDelete } = useSwipeDelete(goal.id, onDelete, registerSwipeable);

  // A tap that closed an open card is spent on that, so it doesn't also open
  // the goal behind the closing swipe.
  const handlePress = useCallback(() => {
    if (onCardPress?.()) return;
    onPress(goal.id);
  }, [goal.id, onPress, onCardPress]);

  const figure = done ? dim(light, 0.6) : light ? '#111111' : '#ffffff';
  const isDebt = goal.kind === 'debt';

  // Debt and Savings share the exact same card shape — a name row, then the
  // headline figure with its "of X" caption (debt's own reads "left of X",
  // since the headline there is what's still owed rather than what's been
  // saved), then the bar — differing only in which numbers and words go
  // into it, so those are picked once here rather than building two
  // near-identical trees.
  const headlineAmount = isDebt ? goal.remaining : goal.saved;
  const caption = isDebt
    ? (goal.location ? `left from ${goal.location}` : `left of ${money(goal.target)}`)
    : (goal.location ? `saved in ${goal.location}` : `of ${money(goal.target)}`);
  const accessibilityLabel = done
    ? `${goal.name}, ${isDebt ? 'cleared' : 'completed'}`
    : isDebt ? `${goal.name}, ${money(goal.remaining)} left` : goal.name;

  const card = (
    <Card light={light}>
      <GlassPressable
        variant="field"
        pressScale={false}
        onPress={handlePress}
        style={{ padding: 16 }}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <View className="flex-row items-center justify-between" style={{ gap: 12 }}>
          <View className="flex-row items-center flex-1" style={{ gap: 8 }}>
            {done && <CheckIcon size={14} color={POSITIVE} />}
            <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 15, color: done ? dim(light, 0.5) : textColor(light).tertiary }}>{goal.name}</Text>
          </View>
          <View className="flex-row items-center" style={{ gap: 8 }}>
            {!done && <Text className="text-[13px] font-medium" style={{ color: POSITIVE }}>{goal.percent}%</Text>}
            <ChevronRight color={textColor(light).disabled} />
          </View>
        </View>
        {!done && (
          <>
            <View className="flex-row items-baseline" style={{ gap: 8, marginTop: 8, marginBottom: 12 }}>
              <Text style={{ fontSize: 24, fontWeight: '400', letterSpacing: -0.5, color: figure, ...TABULAR }}>
                {money(headlineAmount)}
              </Text>
              <Text className="text-[13px]" numberOfLines={1} style={{ flexShrink: 1, color: textColor(light).tertiary }}>
                {caption}
              </Text>
            </View>
            <ProgressBar percent={goal.percent} height={5} light={light} />
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
