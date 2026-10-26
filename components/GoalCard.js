import { memo, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { GlassPressable } from './Glass';
import { CheckIcon, ChevronRight } from './icons';
import { SwipeRow } from './SwipeDeleteAction';
import { ProgressBar, POSITIVE, cardFill, dim, money } from './savingsShared';
import { textColor } from '../utils/colors';
import { TABULAR, FONT } from '../utils/type';

// When a goal is deleted it fades out and the ones below slide up into its
// place, so the removal is something you see happen.
const REMOVE_MS = 240;

// A goal or loan on the list, one row of the page's single grouped card (the list wraps
// them in one Card; `divider` draws the line under this row): the name large on the left
// with a quiet line under it ("₹18,000 saved of ₹30,000"), the percentage opposite, and a
// bar across the full width below. Deliberately nothing else — the rest is on its own
// page.
//
// Swiping it left reveals a delete button, which asks `onDelete` right away (the
// caller confirms — a goal takes its history with it). `registerSwipeable`,
// `onSwipeOpen` and `onCardPress` let the list keep to one open card at a time
// and have a tap that closes one be spent on that; leave them out for a card
// that stands alone.
//
// A finished goal (`done`) is the same card with a tick by the name, dimmer
// name and no figure or bar: it is done, so the list stays quieter for it.
function GoalCard({ goal, onPress, onDelete, registerSwipeable, onSwipeOpen, onCardPress, light = false, done = false, note, divider = false, still = false }) {
  // A tap that closed an open card is spent on that, so it doesn't also open
  // the goal behind the closing swipe.
  const handlePress = useCallback(() => {
    if (onCardPress?.()) return;
    onPress(goal.id);
  }, [goal.id, onPress, onCardPress]);

  const isDebt = goal.kind === 'debt';
  // Savings shows what has been saved; a loan shows what is still owed.
  const figure = isDebt ? goal.remaining : goal.saved;
  // "₹18,000 saved of ₹30,000". A loan counts what is paid out of what the schedule
  // adds up to, which is what its percentage is measured against.
  const detail = isDebt
    ? `${money(goal.saved)} paid of ${money(goal.saved + goal.remaining)}`
    : `${money(goal.saved)} saved of ${money(goal.target)}`;
  const accessibilityLabel = done
    ? `${goal.name}, ${isDebt ? 'cleared' : 'completed'}`
    : `${goal.name}, ${money(figure)} ${isDebt ? 'left' : 'saved'}`;

  // Paints the card's own fill, so a swiped-open row doesn't show its delete button
  // through itself.
  const card = (
    <View style={{ backgroundColor: cardFill(light) }}>
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
            {!!note && <Text style={{ marginLeft: 'auto', fontSize: FONT.caption, color: textColor(light).tertiary }}>{note}</Text>}
          </View>
        ) : (
          <>
            <View className="flex-row items-center justify-between" style={{ gap: 12 }}>
              <View style={{ flexShrink: 1 }}>
                <Text numberOfLines={1} style={{ fontSize: FONT.body, fontWeight: '400', color: textColor(light).primary }}>{goal.name}</Text>
                <Text numberOfLines={1} style={{ fontSize: FONT.caption, fontWeight: '400', color: textColor(light).tertiary, marginTop: 4, ...TABULAR }}>{detail}</Text>
              </View>
              <View className="flex-row items-center" style={{ gap: 4 }}>
                <Text style={{ fontSize: FONT.body, fontWeight: '400', color: textColor(light).primary, ...TABULAR }}>{goal.percent}%</Text>
                <ChevronRight color={textColor(light).disabled} />
              </View>
            </View>
            <View style={{ marginTop: 16 }}>
              <ProgressBar percent={goal.percent} height={7} light={light} trackColor={dim(light, 0.1)} still={still} />
            </View>
          </>
        )}
      </GlassPressable>
      {divider && <View style={{ height: StyleSheet.hairlineWidth, marginHorizontal: 20, backgroundColor: light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)' }} />}
    </View>
  );

  return (
    <Animated.View
      layout={LinearTransition.duration(REMOVE_MS)}
      // `still` marks a list that changes under an open page (the debt chart's month
      // moving): a card that was already there stays untouched, and only one that
      // comes in fades in, as one that goes out fades out.
      entering={still ? FadeIn.duration(REMOVE_MS) : undefined}
      exiting={FadeOut.duration(REMOVE_MS)}
    >
      {onDelete ? (
        <SwipeRow id={goal.id} onDelete={onDelete} registerSwipeable={registerSwipeable} onSwipeOpen={onSwipeOpen} label="Delete goal">
          {card}
        </SwipeRow>
      ) : card}
    </Animated.View>
  );
}

export default memo(GoalCard);
