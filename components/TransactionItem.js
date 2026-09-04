import { memo, useCallback, useRef } from 'react';
import { View, Text, Pressable } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { formatCurrencyFull, dateBoxParts } from '../utils/format';
import { EditIcon, TrashIcon } from './icons';

const ACTION_WIDTH = 68;

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

// Fades + scales the two action buttons in as the row is dragged open,
// rather than having them sit fully-opaque under the card the whole time —
// reads as a much cleaner reveal than a static layer just being uncovered.
function RightActions({ drag, onEdit, onDelete, light }) {
  const style = useAnimatedStyle(() => {
    const progress = Math.min(1, Math.max(0, -drag.value / ACTION_WIDTH));
    return { opacity: progress, transform: [{ scale: 0.7 + progress * 0.3 }] };
  });

  return (
    <View style={{ flexDirection: 'row', height: '100%' }}>
      <Animated.View style={[{ flexDirection: 'row' }, style]}>
        <Pressable
          onPress={onEdit}
          style={{ width: ACTION_WIDTH, alignItems: 'center', justifyContent: 'center', backgroundColor: light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)' }}
        >
          <EditIcon size={19} color={light ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.85)'} />
        </Pressable>
        <Pressable
          onPress={onDelete}
          style={{ width: ACTION_WIDTH, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,59,48,0.56)' }}
        >
          <TrashIcon size={19} color="#ffffff" />
        </Pressable>
      </Animated.View>
    </View>
  );
}

// `light` is a one-off experimental prop for trying a light theme on just
// the Dashboard — see the matching comment in Header.js.
function TransactionItem({ tx, onEdit, onDelete, isIncome, registerSwipeable, onSwipeOpen, onCardPress, light = false }) {
  const swipeableRef = useRef(null);

  const setSwipeableRef = useCallback(r => {
    swipeableRef.current = r;
    registerSwipeable?.(tx.id, r);
  }, [tx.id, registerSwipeable]);

  const handleEdit = useCallback(() => {
    swipeableRef.current?.close();
    onEdit(tx);
  }, [tx, onEdit]);

  const handleDelete = useCallback(() => {
    swipeableRef.current?.close();
    // Heavy impact — the strongest discrete pulse the API offers.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onDelete(tx.id);
  }, [tx.id, onDelete]);

  const handleCardPress = useCallback(() => {
    onCardPress?.(tx.id);
  }, [tx.id, onCardPress]);

  return (
    <ReanimatedSwipeable
      ref={setSwipeableRef}
      friction={1.8}
      rightThreshold={32}
      overshootRight={false}
      renderRightActions={(_progress, drag) => (
        <RightActions drag={drag} onEdit={handleEdit} onDelete={handleDelete} light={light} />
      )}
      onSwipeableWillOpen={() => onSwipeOpen?.(tx.id)}
    >
      <Pressable
        onPress={handleCardPress}
        className="flex-row items-center justify-between py-3 px-4"
        style={{ backgroundColor: light ? '#FAFAF8' : '#0a0a0a' }}
      >
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
      </Pressable>
    </ReanimatedSwipeable>
  );
}

export default memo(TransactionItem);
