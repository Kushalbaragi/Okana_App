import { memo, useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS } from 'react-native-reanimated';
import {
  formatCurrencyFull,
  formatDateFull,
  getDailyExpenseTotals,
  getIntensityThresholds,
  getEarliestDate,
  spendShadeFor,
  today,
  toDateStr as toStr,
} from '../utils/format';
import { MONTH_NAMES as MONTHS } from '../utils/monthlyRecap';
import BudgetStatusBar from './BudgetStatusBar';

const BLUR_METHOD = Platform.OS === 'android' ? 'dimezisBlurView' : undefined;
const SETTLE_EASING = Easing.bezier(0.16, 1, 0.3, 1);

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Hand-rolled (rather than reusing AnimatedModal twice) because the day
// sheet and the calendar card need to live in the SAME native Modal.
// Two simultaneously-open RN <Modal> components only appeared to stack
// correctly in the web preview (react-native-web fakes Modal with plain
// fixed-position divs) — on a real iOS/Android device the second Modal
// never rendered, so the day sheet silently did nothing.
function SpendCalendarModal({ open, onClose, transactions, recap, budget }) {
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const now = new Date();
  const [view, setView] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(null);
  const [displayDate, setDisplayDate] = useState(null);

  const [modalVisible, setModalVisible] = useState(open);
  const backdropOpacity = useSharedValue(0);
  const cardProgress = useSharedValue(0);
  const sheetProgress = useSharedValue(0);

  useEffect(() => {
    if (open) {
      setModalVisible(true);
      setSelectedDate(null);
      setDisplayDate(null);
      sheetProgress.value = 0;
      backdropOpacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) });
      cardProgress.value = withTiming(1, { duration: 380, easing: SETTLE_EASING });
    } else {
      backdropOpacity.value = withTiming(0, { duration: 220, easing: Easing.in(Easing.cubic) });
      cardProgress.value = withTiming(
        0,
        { duration: 220, easing: Easing.in(Easing.cubic) },
        finished => { if (finished) runOnJS(setModalVisible)(false); },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keeps displayDate around through the sheet's own close animation so its
  // content doesn't blank out mid-slide-down while selectedDate has already
  // gone back to null.
  useEffect(() => {
    if (selectedDate) {
      setDisplayDate(selectedDate);
      sheetProgress.value = withTiming(1, { duration: 340, easing: SETTLE_EASING });
    } else {
      sheetProgress.value = withTiming(0, { duration: 220, easing: Easing.in(Easing.cubic) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardProgress.value,
    transform: [
      { translateY: (1 - cardProgress.value) * 14 },
      { scale: 0.94 + cardProgress.value * 0.06 },
    ],
  }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - sheetProgress.value) * windowHeight }],
  }));

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
      .filter(tx => tx.date === displayDate)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [transactions, displayDate],
  );

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  function prevMonth() { setView(new Date(year, month - 1, 1)); setSelectedDate(null); }
  function nextMonth() { setView(new Date(year, month + 1, 1)); setSelectedDate(null); }

  if (!modalVisible) return null;

  return (
    <Modal visible={modalVisible} transparent animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable style={{ flex: 1 }} onPress={onClose}>
          <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
            <BlurView intensity={30} tint="dark" experimentalBlurMethod={BLUR_METHOD} style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />
          </Animated.View>
        </Pressable>

        <View
          style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }]}
          pointerEvents="box-none"
        >
          <Animated.View style={cardStyle} pointerEvents="auto">
            <View style={{ width: windowWidth - 48, alignItems: 'center' }}>
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
                        <Text className="text-white/80 text-base font-medium">{recap.monthName} Review</Text>
                      </View>
                      <Text style={{ color: 'rgba(255,255,255,0.4)' }}>›</Text>
                    </Pressable>
                  )}

                  {budget && <BudgetStatusBar {...budget} />}

                  <View className="flex-row items-center justify-between mb-4">
                    <Pressable
                      onPress={prevMonth}
                      className="w-7 h-7 rounded-full items-center justify-center"
                      style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
                    >
                      <Text style={{ color: 'rgba(255,255,255,0.5)' }}>‹</Text>
                    </Pressable>
                    <Text className="text-white/80 text-base font-semibold">{MONTHS[month]} {year}</Text>
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
            </View>
          </Animated.View>
        </View>

        <Animated.View
          style={[{ position: 'absolute', left: 0, right: 0, bottom: 0 }, sheetStyle]}
          pointerEvents={selectedDate ? 'box-none' : 'none'}
        >
          <Pressable onPress={() => {}}>
            <View
              className="w-full rounded-t-3xl px-6 pt-5"
              style={{
                maxHeight: windowHeight * 0.55,
                paddingBottom: insets.bottom + 20,
                backgroundColor: '#1c1c1f',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.08)',
              }}
            >
              <View className="w-8 h-1 rounded-full mx-auto mb-4" style={{ backgroundColor: 'rgba(255,255,255,0.14)' }} />
              <Text className="text-white/70 text-base font-semibold mb-3">{formatDateFull(displayDate)}</Text>
              {dayTxs.length === 0 ? (
                <Text className="text-white/30 text-base mb-1">No transactions — spend-free day 🎉</Text>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }}>
                  <View style={{ gap: 12, paddingBottom: 4 }}>
                    {dayTxs.map(tx => (
                      <View key={tx.id} className="flex-row items-center justify-between" style={{ gap: 8 }}>
                        <Text className="text-white/70 text-base" numberOfLines={1} style={{ flex: 1 }}>
                          {tx.description || (tx.type === 'income' ? 'Income' : 'Expense')}
                        </Text>
                        <Text
                          className="text-base"
                          style={{ fontWeight: '500', color: tx.type === 'income' ? '#4ade80' : 'rgba(255,255,255,0.5)' }}
                        >
                          {tx.type === 'income' ? '+' : '-'}{formatCurrencyFull(tx.amount)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              )}
            </View>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

export default memo(SpendCalendarModal);
