import { memo, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import {
  formatCurrencyFull,
  formatDateFull,
  getDailyExpenseTotals,
  getIntensityThresholds,
  getEarliestDate,
  spendShadeFor,
  today,
} from '../utils/format';
import { AnimatedModal } from './AnimatedModal';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function toStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function SpendCalendarModal({ open, onClose, transactions, recap }) {
  const { height: windowHeight } = useWindowDimensions();
  const now = new Date();
  const [view, setView] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    if (open) setSelectedDate(null);
  }, [open]);

  const year = view.getFullYear();
  const month = view.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = today();

  const dailyTotals = useMemo(() => getDailyExpenseTotals(transactions), [transactions]);
  const thresholds = useMemo(() => getIntensityThresholds(dailyTotals), [dailyTotals]);
  const earliest = useMemo(() => getEarliestDate(transactions), [transactions]);

  const dayTxs = useMemo(
    () => transactions
      .filter(tx => tx.date === selectedDate)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [transactions, selectedDate],
  );

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  function prevMonth() { setView(new Date(year, month - 1, 1)); setSelectedDate(null); }
  function nextMonth() { setView(new Date(year, month + 1, 1)); setSelectedDate(null); }

  return (
    <AnimatedModal open={open} onClose={onClose} variant="center">
      <View
        className="w-full rounded-3xl px-6 py-6"
        style={{ maxWidth: 340, maxHeight: windowHeight * 0.8, backgroundColor: '#1c1c1f', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}
      >
        <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }}>
          {recap?.available && (
            <Pressable
              onPress={recap.onOpen}
              className="flex-row items-center justify-between mb-4 px-3 py-[10px] rounded-xl"
              style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
            >
              <View className="flex-row items-center" style={{ gap: 10 }}>
                <View
                  className="w-7 h-7 rounded-full items-center justify-center"
                  style={{ backgroundColor: recap.seen ? 'rgba(255,255,255,0.08)' : '#a855f7' }}
                >
                  <Text style={{ fontSize: 13 }}>📊</Text>
                </View>
                <Text className="text-white/80 text-[13px] font-medium">{recap.monthName} Review</Text>
              </View>
              <Text style={{ color: 'rgba(255,255,255,0.4)' }}>›</Text>
            </Pressable>
          )}

          <View className="flex-row items-center justify-between mb-4">
            <Pressable
              onPress={prevMonth}
              className="w-7 h-7 rounded-full items-center justify-center"
              style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
            >
              <Text style={{ color: 'rgba(255,255,255,0.5)' }}>‹</Text>
            </Pressable>
            <Text className="text-white/80 text-sm font-semibold">{MONTHS[month]} {year}</Text>
            <Pressable
              onPress={nextMonth}
              className="w-7 h-7 rounded-full items-center justify-center"
              style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
            >
              <Text style={{ color: 'rgba(255,255,255,0.5)' }}>›</Text>
            </Pressable>
          </View>

          <View className="flex-row mb-1.5">
            {DAYS.map((d, i) => (
              <View key={i} style={{ flex: 1 }}>
                <Text className="text-center text-white/25 text-[11px] font-medium">{d}</Text>
              </View>
            ))}
          </View>

          {weeks.map((week, wi) => (
            <View key={wi} className="flex-row" style={{ gap: 6, marginBottom: 6 }}>
              {week.map((d, i) => {
                if (!d) return <View key={i} style={{ flex: 1 }} />;
                const str = toStr(new Date(year, month, d));
                const shade = spendShadeFor(str, { dailyTotals, thresholds, earliest, todayStr });
                const isToday = str === todayStr;
                const isSelected = selectedDate === str;
                return (
                  <Pressable
                    key={i}
                    disabled={!shade.isKnown}
                    onPress={() => setSelectedDate(prev => (prev === str ? null : str))}
                    className="aspect-square items-center justify-center rounded-md"
                    style={{
                      flex: 1,
                      backgroundColor: shade.bg,
                      borderWidth: isSelected ? 1.5 : isToday ? 1 : 0,
                      borderColor: isSelected ? 'rgba(255,255,255,0.65)' : isToday ? 'rgba(255,255,255,0.3)' : 'transparent',
                    }}
                  >
                    <Text style={{ color: shade.color, fontSize: 12, fontWeight: '500' }}>{d}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}

          {selectedDate && (
            <View className="mt-3 rounded-lg p-2.5" style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}>
              <Text className="text-white/60 text-[11px] font-semibold mb-1.5">{formatDateFull(selectedDate)}</Text>
              {dayTxs.length === 0 ? (
                <Text className="text-white/30 text-[11px]">No transactions — spend-free day 🎉</Text>
              ) : (
                <View style={{ gap: 6 }}>
                  {dayTxs.map(tx => (
                    <View key={tx.id} className="flex-row items-center justify-between" style={{ gap: 8 }}>
                      <Text className="text-white/70 text-[11px]" numberOfLines={1} style={{ flex: 1 }}>
                        {tx.description || (tx.type === 'income' ? 'Income' : 'Expense')}
                      </Text>
                      <Text
                        style={{ fontSize: 11, fontWeight: '500', color: tx.type === 'income' ? '#4ade80' : 'rgba(255,255,255,0.5)' }}
                      >
                        {tx.type === 'income' ? '+' : '-'}{formatCurrencyFull(tx.amount)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          <View className="flex-row items-center justify-center mt-3" style={{ gap: 12 }}>
            <View className="flex-row items-center" style={{ gap: 4 }}>
              <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: 'rgba(34,197,94,0.5)' }} />
              <Text className="text-white/30" style={{ fontSize: 10 }}>No spend</Text>
            </View>
            <View className="flex-row items-center" style={{ gap: 4 }}>
              <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: 'rgba(239,68,68,0.5)' }} />
              <Text className="text-white/30" style={{ fontSize: 10 }}>Spent</Text>
            </View>
          </View>
        </ScrollView>
      </View>
    </AnimatedModal>
  );
}

export default memo(SpendCalendarModal);
