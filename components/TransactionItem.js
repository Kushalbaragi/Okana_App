import { memo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { formatCurrencyFull, dateBoxParts } from '../utils/format';

function DateBox({ dateStr }) {
  const { day, month } = dateBoxParts(dateStr);
  return (
    <View className="items-center justify-center w-7 h-7 rounded bg-white/5 shrink-0 mr-2.5">
      <Text className="text-white/70 text-[9px] font-semibold leading-none">{day}</Text>
      <Text className="text-white/30 text-[6.5px] font-medium leading-none mt-0.5 tracking-tight">{month}</Text>
    </View>
  );
}

function TransactionItem({ tx, onEdit, isIncome }) {
  return (
    <Pressable
      onPress={() => onEdit(tx)}
      className="flex-row items-center justify-between py-3 px-1"
      style={{ borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}
    >
      <View className="flex-row items-center flex-1 pr-3">
        <DateBox dateStr={tx.date} />
        <Text numberOfLines={1} className="text-white text-sm flex-shrink">
          {tx.description || (isIncome ? 'Income' : 'Expense')}
        </Text>
      </View>

      <Text
        className="text-sm font-medium shrink-0"
        style={{ color: isIncome ? 'rgba(74,222,128,0.8)' : 'rgba(255,255,255,0.45)' }}
      >
        {isIncome ? '+' : '-'}{formatCurrencyFull(tx.amount)}
      </Text>
    </Pressable>
  );
}

export default memo(TransactionItem);
