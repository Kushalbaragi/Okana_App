import { memo, useCallback, useEffect, useRef } from 'react';
import { View, Text, Pressable } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { formatCurrencyPlain } from '../utils/format';
import { SwipeDeleteAction, useSwipeDelete } from './SwipeDeleteAction';
import { CARD_COLOR } from './Glass';
import { textColor, INCOME_TEXT } from '../utils/colors';
import { BODY, TABULAR } from '../utils/type';
import { LEDGER_PILL_INSET } from '../utils/spacing';

// `light` is a one-off experimental prop for trying a light theme on just
// the Dashboard — see the matching comment in Header.js.
// `swipeable` is how the list keeps its first paint cheap. Mounting
// ReanimatedSwipeable costs real gesture-handler + worklet setup per row,
// and the list isn't virtualized — it renders the whole running history at
// once, not just the visible rows (see TransactionList's own comment). So
// the list paints rows flat first and flips this to true once the initial
// commit has settled (see `settled` in TransactionList), moving the setup
// off the critical path instead of removing the feature.
function TransactionItem({ tx, onEdit, onDelete, isIncome, registerSwipeable, onSwipeOpen, onCardPress, light = false, swipeable = true, cardColor = CARD_COLOR }) {
  // Tapping the trash slides the row shut and asks `onDelete` (which opens a
  // confirmation) at once, rather than waiting for the slide to finish.
  const { setSwipeableRef, handleDelete } = useSwipeDelete(tx.id, onDelete, registerSwipeable);

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
      className="py-3"
      // Matches MonthHeader's own paddingHorizontal (both read
      // LEDGER_PILL_INSET), so a row's amount starts under the pill's text
      // above it rather than further left at the raw list edge.
      style={{ backgroundColor: cardColor, paddingLeft: LEDGER_PILL_INSET, paddingRight: LEDGER_PILL_INSET }}
    >
      {/* Just the description and the amount, like a line in a note — the day
          is said once above a run of rows (see TransactionList), not on each. */}
      <Animated.View className="flex-row items-center" style={contentStyle}>
        {/* Not yet synced to the server — sitting in the offline queue, or
            an insert/update still in flight. */}
        {tx._pending && (
          <View style={{ width: 5, height: 5, borderRadius: 2.5, marginRight: 8, backgroundColor: light ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)' }} />
        )}
        <Text numberOfLines={1} style={[BODY, { flex: 1, color: isIncome ? INCOME_TEXT : textColor(light).secondary }]}>
          {tx.description || (isIncome ? 'Income' : 'Expense')}
        </Text>
        {/* Same colour as the description, so the row reads as one line. */}
        <Text numberOfLines={1} style={[BODY, TABULAR, { marginLeft: 12, textAlign: 'right', color: isIncome ? INCOME_TEXT : textColor(light).secondary }]}>
          {formatCurrencyPlain(tx.amount)}
        </Text>
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
        <SwipeDeleteAction drag={drag} onDelete={handleDelete} label="Delete transaction" />
      )}
      onSwipeableWillOpen={() => onSwipeOpen?.(tx.id)}
    >
      {row}
    </ReanimatedSwipeable>
  );
}

export default memo(TransactionItem);
