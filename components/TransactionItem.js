import { memo, useCallback, useEffect, useRef } from 'react';
import { View, Text, Pressable } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { formatCurrencyFull, dateBoxParts } from '../utils/format';
import { TrashIcon } from './icons';
import { CARD_COLOR } from './Glass';

const ACTION_WIDTH = 68;
// A circular button floating in the revealed area, the way Reminders does
// its swipe actions — the button is the shape, rather than the whole
// revealed strip being a solid colour block.
const DELETE_SIZE = 31;
// Keeps the actual tap target at ~45px even though the circle is drawn at
// 31 — below Apple's 44pt minimum the button looks right but gets fiddly
// to actually hit, especially as the thumb is still coming off a swipe.
const DELETE_HIT_SLOP = 7;
// iOS systemRed as it renders in dark mode. Solid, not the translucent
// wash the full-bleed block used — a small circle needs the full weight to
// read as the destructive action at this size.
const DELETE_RED = '#FF453A';
// How long a tapped delete waits for the swipe row's own close to report
// finishing before applying anyway — comfortably past that spring's real
// duration, so it only ever matters when the close event doesn't arrive.
const DELETE_FALLBACK_MS = 600;

function DateBox({ dateStr, light }) {
  const { day, month } = dateBoxParts(dateStr);
  return (
    <View
      className="items-center justify-center w-8 h-8 rounded shrink-0 mr-2.5"
      style={{ backgroundColor: light ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)' }}
    >
      <Text className="text-[11px] font-semibold leading-none" style={{ color: light ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)' }}>{day}</Text>
      <Text className="text-[8px] font-medium leading-none mt-0.5 tracking-tight" style={{ color: light ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.30)' }}>{month}</Text>
    </View>
  );
}

// Fades + scales the delete action in as the row is dragged open, rather
// than having it sit fully-opaque under the card the whole time — reads as
// a much cleaner reveal than a static layer just being uncovered.
//
// Delete only. Editing used to live here too, behind the same swipe, which
// made a gesture the sole route to it — tapping the row now opens the edit
// sheet instead, leaving the swipe as a shortcut for the one destructive
// action rather than the only way to reach either.
function RightActions({ drag, onDelete }) {
  const style = useAnimatedStyle(() => {
    const progress = Math.min(1, Math.max(0, -drag.value / ACTION_WIDTH));
    return { opacity: progress, transform: [{ scale: 0.7 + progress * 0.3 }] };
  });

  return (
    <View style={{ width: ACTION_WIDTH, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={style}>
        <Pressable
          onPress={onDelete}
          hitSlop={DELETE_HIT_SLOP}
          style={{
            width: DELETE_SIZE,
            height: DELETE_SIZE,
            borderRadius: DELETE_SIZE / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: DELETE_RED,
          }}
          accessibilityRole="button"
          accessibilityLabel="Delete transaction"
        >
          <TrashIcon size={14} color="#ffffff" />
        </Pressable>
      </Animated.View>
    </View>
  );
}

// `light` is a one-off experimental prop for trying a light theme on just
// the Dashboard — see the matching comment in Header.js.
// `swipeable` is how the list keeps a tab/period switch cheap. Mounting
// ReanimatedSwipeable costs real gesture-handler + worklet setup per row,
// and a switch remounts every row at once — that was the single biggest
// chunk of the 264-411ms a switch used to spend in this list, and it
// matters more now the list isn't virtualized (it renders a whole month's
// rows, not just the visible ones — see the card's own comment in
// TransactionList). So the list paints rows flat first and flips this to
// true once the commit has settled (see `settled` in TransactionList),
// moving the setup off the critical path instead of removing the feature.
function TransactionItem({ tx, onEdit, onDelete, isIncome, registerSwipeable, onSwipeOpen, onCardPress, light = false, swipeable = true, cardColor = CARD_COLOR }) {
  const swipeableRef = useRef(null);

  const setSwipeableRef = useCallback(r => {
    swipeableRef.current = r;
    registerSwipeable?.(tx.id, r);
  }, [tx.id, registerSwipeable]);

  // Delete is applied once the swipe row has finished closing, not the
  // instant the trash button is tapped — the same "let the interaction
  // finish, then apply the change" timing add/edit get from AddModal's
  // close (see holdReveal in the home screen). Removing the row while its
  // swipe is still sliding shut makes the list jump under the animation.
  // onSwipeableClose is the normal trigger; the timer is a backstop for a
  // close that never reports finishing (interrupted by a new drag, or the
  // row unmounting first) so a tapped delete can't be silently lost.
  // pendingDeleteRef makes whichever fires first the only one that runs.
  const pendingDeleteRef = useRef(false);

  const commitDelete = useCallback(() => {
    if (!pendingDeleteRef.current) return;
    pendingDeleteRef.current = false;
    onDelete(tx.id);
  }, [tx.id, onDelete]);

  const handleDelete = useCallback(() => {
    if (pendingDeleteRef.current) return;
    pendingDeleteRef.current = true;
    swipeableRef.current?.close();
    // Heavy impact — the strongest discrete pulse the API offers.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setTimeout(commitDelete, DELETE_FALLBACK_MS);
  }, [commitDelete]);

  // Tapping a row opens it for editing. An already-open swipe takes
  // priority and swallows the tap (onCardPress returns true when it closed
  // one), so dismissing a swiped-open row can't also fling the edit sheet
  // open behind it.
  const handleCardPress = useCallback(() => {
    if (onCardPress?.(tx.id)) return;
    onEdit(tx);
  }, [tx, onCardPress, onEdit]);

  // Crossfades the row's inner content (date, description, amount) whenever
  // the transaction's own visible fields change — e.g. after editing it —
  // instead of the new values just popping in. The card itself (the
  // Pressable below: background, padding, position in the list) never
  // moves; only this inner layer dips out and back in. Skipped on the very
  // first mount, when there's no "old" content to fade from.
  const contentOpacity = useSharedValue(1);
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    // React has already committed the new text by the time this runs, so
    // the fade-in half of this sequence reveals the new values — the dip to
    // 0 is what hides the old ones on the way out.
    contentOpacity.value = withSequence(
      withTiming(0, { duration: 140 }),
      withTiming(1, { duration: 220 }),
    );
  }, [tx.description, tx.amount, tx.date, isIncome, contentOpacity]);
  const contentStyle = useAnimatedStyle(() => ({ opacity: contentOpacity.value }));

  const row = (
    <Pressable
      onPress={handleCardPress}
      className="py-4 px-4"
      style={{ backgroundColor: cardColor }}
    >
      <Animated.View className="flex-row items-center justify-between" style={contentStyle}>
        <View className="flex-row items-center flex-1 pr-3">
          <DateBox dateStr={tx.date} light={light} />
          <Text numberOfLines={1} className="text-base flex-shrink" style={{ color: light ? '#111111' : '#ffffff' }}>
            {tx.description || (isIncome ? 'Income' : 'Expense')}
          </Text>
        </View>

        <View className="flex-row items-center shrink-0" style={{ gap: 6 }}>
          {/* Not yet synced to the server — sitting in the offline queue,
              or an insert/update still in flight. */}
          {tx._pending && (
            <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: light ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)' }} />
          )}
          <Text
            className="text-base font-medium"
            style={{ color: isIncome ? 'rgba(74,222,128,0.8)' : light ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }}
          >
            {isIncome ? '+' : '-'}{formatCurrencyFull(tx.amount)}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );

  // Identical markup either way — the flat row is the exact same Pressable
  // the swipeable would wrap, so arming the swipe later is invisible: no
  // reflow, no flash, just the gesture becoming live a frame or two after
  // the rows are already on screen.
  if (!swipeable) return row;

  return (
    <ReanimatedSwipeable
      ref={setSwipeableRef}
      friction={1.8}
      rightThreshold={32}
      overshootRight={false}
      renderRightActions={(_progress, drag) => (
        <RightActions drag={drag} onDelete={handleDelete} />
      )}
      onSwipeableWillOpen={() => onSwipeOpen?.(tx.id)}
      onSwipeableClose={commitDelete}
    >
      {row}
    </ReanimatedSwipeable>
  );
}

export default memo(TransactionItem);
