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

  // Debt's own card, one line and a bar — the user's own sketch: "Car Loan —
  // 2,50,000 left" with the arrow, then just the progress underneath.
  // Deliberately lighter than Savings' card (no percent badge, no location,
  // no second "of X at start" line) — the loan's own page still has all of
  // that; this is the list, and a loan reads fine as one line and a bar.
  // Only one of these two is ever built — a list row has no use for the
  // other kind's tree, so there's no reason to pay for building it too.
  const card = isDebt ? (
    <Card light={light}>
      <GlassPressable
        variant="field"
        pressScale={false}
        onPress={handlePress}
        style={{ padding: 16 }}
        accessibilityRole="button"
        accessibilityLabel={done ? `${goal.name}, cleared` : `${goal.name}, ${money(goal.remaining)} left`}
      >
        <View className="flex-row items-center justify-between" style={{ gap: 12 }}>
          <View className="flex-row items-baseline flex-1" style={{ gap: 6 }}>
            {done && <CheckIcon size={14} color={POSITIVE} />}
            <Text numberOfLines={1} style={{ fontSize: 15, color: done ? dim(light, 0.5) : figure }}>{goal.name}</Text>
            {!done && (
              <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 15, color: textColor(light).tertiary }}>
                — {money(goal.remaining)} left
              </Text>
            )}
          </View>
          <ChevronRight color={textColor(light).disabled} />
        </View>
        {!done && <View style={{ marginTop: 12 }}><ProgressBar percent={goal.percent} height={5} light={light} /></View>}
      </GlassPressable>
    </Card>
  ) : (
    <Card light={light}>
      <GlassPressable
        variant="field"
        pressScale={false}
        onPress={handlePress}
        style={{ padding: 16 }}
        accessibilityRole="button"
        accessibilityLabel={done ? `${goal.name}, completed` : goal.name}
      >
        <View className="flex-row items-center justify-between" style={{ gap: 12 }}>
          <View style={{ flexShrink: 1 }}>
            <View className="flex-row items-center" style={{ gap: 8 }}>
              {done && <CheckIcon size={14} color={POSITIVE} />}
              <Text className="text-[15px]" numberOfLines={1} style={{ flexShrink: 1, color: done ? dim(light, 0.5) : textColor(light).tertiary }}>{goal.name}</Text>
            </View>
            {!!goal.location && (
              <Text className="text-xs" numberOfLines={1} style={{ marginTop: 2, color: dim(light, 0.4) }}>{goal.location}</Text>
            )}
          </View>
          <View className="flex-row items-center" style={{ gap: 6 }}>
            <View style={{ backgroundColor: 'rgba(74,222,128,0.14)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
              <Text className="text-[13px] font-medium" style={{ color: '#4ade80' }}>{goal.percent}%</Text>
            </View>
            <ChevronRight color={textColor(light).disabled} />
          </View>
        </View>
        <View className="flex-row items-baseline" style={{ gap: 8, marginTop: 8, marginBottom: done ? 0 : 12 }}>
          <Text style={{ fontSize: 24, fontWeight: '400', letterSpacing: -0.5, color: figure, ...TABULAR }}>
            {money(goal.saved)}
          </Text>
          <Text className="text-[13px]" numberOfLines={1} style={{ flexShrink: 1, color: textColor(light).tertiary }}>
            of {money(goal.target)}
          </Text>
        </View>
        {!done && <ProgressBar percent={goal.percent} height={5} light={light} />}
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
