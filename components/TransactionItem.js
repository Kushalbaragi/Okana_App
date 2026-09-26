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

// Wide enough for a 7-figure amount ("₹9999999", no thousands separators —
// see formatCurrencyPlain) at BODY size — fixed rather than sized to
// content, so the dash's own box always starts at the same x. Left-aligned
// on purpose (not right-aligned) — every amount starts at the same left
// edge, which is what was actually asked for; the tradeoff is the visible
// gap before the dash varies with how many digits that row's amount has
// (a short "₹375" leaves more room than "₹56900" does).
const AMOUNT_COL_WIDTH = 82;

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
      style={{ backgroundColor: cardColor, paddingLeft: LEDGER_PILL_INSET }}
    >
      {/* Three columns — amount, dash, description — the date it happened
          is said once by the month this row sits under (see MonthHeader in
          TransactionList), not repeated on every row underneath it. The
          amount column is a fixed width (not sized to its own digits), so
          every row's dash and description line up in a straight column
          regardless of how long that row's own amount is. */}
      <Animated.View className="flex-row items-center" style={contentStyle}>
        <Text
          numberOfLines={1}
          style={[BODY, TABULAR, { width: AMOUNT_COL_WIDTH, color: isIncome ? INCOME_TEXT : textColor(light).primary }]}
        >
          {formatCurrencyPlain(tx.amount)}
        </Text>
        <Text style={[BODY, { marginLeft: 4, color: textColor(light).disabled }]}>-</Text>
        {/* Not yet synced to the server — sitting in the offline queue, or
            an insert/update still in flight. */}
        {tx._pending && (
          <View style={{ width: 5, height: 5, borderRadius: 2.5, marginLeft: 8, backgroundColor: light ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)' }} />
        )}
        {/* Amount now carries the brightness, description the dim — the
            number is what you're scanning the ledger for, the description
            is what jogs your memory once you've spotted it. */}
        <Text numberOfLines={1} style={[BODY, { flexShrink: 1, marginLeft: 8, color: isIncome ? INCOME_TEXT : textColor(light).secondary }]}>
          {tx.description || (isIncome ? 'Income' : 'Expense')}
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
