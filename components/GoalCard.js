import { memo, useCallback } from 'react';
import { View, Text } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import { GlassPressable } from './Glass';
import { CheckIcon } from './icons';
import { SwipeDeleteAction, useSwipeDelete } from './SwipeDeleteAction';
import { Card, ProgressBar, POSITIVE, dim, money } from './savingsShared';
import { textColor } from '../utils/colors';
import { TABULAR, FONT } from '../utils/type';

// When a goal is deleted it fades out and the ones below slide up into its
// place, so the removal is something you see happen.
const REMOVE_MS = 240;

// A goal on the list, as a card of its own: name and status line on top, the
// headline amount as the big number below it, then a thin bar. Deliberately
// nothing else — the rest is on the goal's own page.
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

  const isDebt = goal.kind === 'debt';
  const isEmiDebt = isDebt && goal.debtType === 'emi';

  // Debt and Savings share the exact same card shape — name, a status line
  // (percent for savings and flexible debt, EMIs left for EMI debt), the
  // headline amount, then a thin bar. Nothing else: no location caption, no
  // secondary amount line — `goal.emisRemaining` is the schedule-derived
  // count useSavings.js already computes for EMI debt (see its own comment
  // on why that can't be read off `percent` or `remaining` instead).
  const headlineAmount = isDebt ? goal.remaining : goal.saved;
  // An EMI loan with no tenure set has no EMI count to speak of (it was
  // reading "null EMIs left"), so it falls back to the percent like any other.
  const statusText = isEmiDebt && goal.emisRemaining != null
    ? `${goal.emisRemaining} EMIs left`
    : isDebt
      ? `${goal.percent}% paid`
      : `${money(goal.remaining)} left`;
  const accessibilityLabel = done
    ? `${goal.name}, ${isDebt ? 'cleared' : 'completed'}`
    : isDebt ? `${goal.name}, ${money(goal.remaining)} left` : goal.name;

  const card = (
    <Card light={light}>
      <GlassPressable
        variant="field"
        pressScale={false}
        onPress={handlePress}
        style={{ padding: 20 }}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {/* items-center, not items-baseline. A done card leads this row with
            the CheckIcon, and an SVG has no text baseline to align to — Yoga
            falls back to its height, which pushed the name out of the card's
            padded box and left a cleared loan showing nothing but a tick. The
            name and the status line are the same size and weight anyway, so
            centring puts them on the same line regardless. */}
        <View className="flex-row items-center justify-between" style={{ gap: 12 }}>
          <View className="flex-row items-center flex-1" style={{ gap: 8 }}>
            {done && <CheckIcon size={14} color={POSITIVE} />}
            <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: FONT.body, fontWeight: '400', color: done ? dim(light, 0.5) : textColor(light).tertiary }}>{goal.name}</Text>
          </View>
          {!done && <Text style={{ fontSize: FONT.body, fontWeight: '400', color: textColor(light).tertiary }}>{statusText}</Text>}
        </View>
        {!done && (
          <>
            <Text style={{ fontSize: FONT.amount, fontWeight: '600', marginTop: 10, color: textColor(light).primary, ...TABULAR }}>
              {money(headlineAmount)}
              <Text style={{ fontSize: FONT.body, fontWeight: '400', color: textColor(light).tertiary }}> {isDebt ? 'left' : 'saved'}</Text>
            </Text>
            <View style={{ marginTop: 14 }}>
              <ProgressBar percent={goal.percent} height={5} light={light} trackColor={dim(light, 0.1)} />
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
