import { memo, useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing, runOnJS } from 'react-native-reanimated';
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

const SETTLE_EASING = Easing.bezier(0.16, 1, 0.3, 1);
// Same drag-to-dismiss thresholds as AddModal, for a consistent feel.
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;
const OFF_SCREEN_Y = 1200;

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']; // Monday-first

// Each row slides up and fades in with a small stagger, rather than the
// whole day's list appearing at once.
function DayTransactionRow({ tx, index }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(index * 55, withTiming(1, { duration: 320, easing: SETTLE_EASING }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx.id]);

  const rowStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 14 }],
  }));

  return (
    <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, rowStyle]}>
      <Text className="text-white/70 text-base" numberOfLines={1} style={{ flex: 1 }}>
        {tx.description || (tx.type === 'income' ? 'Income' : 'Expense')}
      </Text>
      <Text
        className="text-base"
        style={{
          fontWeight: '500',
          color: tx.type === 'income' ? '#4ade80' : 'rgba(255,255,255,0.5)',
        }}
      >
        {tx.type === 'income' ? '+' : '-'}{formatCurrencyFull(tx.amount)}
      </Text>
    </Animated.View>
  );
}

function SpendCalendarModal({ open, onClose, onClosed, transactions, recap, budget }) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const now = new Date();
  const [view, setView] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(null);

  // Same pattern as AddModal — managed independently of RN's Modal
  // animationType so `visible` stays mounted through the close animation,
  // and the drag gesture below can share the same translateY.
  const [visible, setVisible] = useState(open);
  const pageTranslateY = useSharedValue(windowHeight);
  const dragY = useSharedValue(0);

  useEffect(() => {
    if (open) {
      setVisible(true);
      setSelectedDate(null);
      dragY.value = 0;
      pageTranslateY.value = withTiming(0, { duration: 950, easing: SETTLE_EASING });
    } else {
      pageTranslateY.value = withTiming(
        windowHeight,
        { duration: 700, easing: SETTLE_EASING },
        finished => {
          if (!finished) return;
          runOnJS(setVisible)(false);
          // Signals the native <Modal> is actually gone — callers use this
          // (rather than a guessed timeout) to know it's safe to present a
          // different Modal without two being mounted at once, which is
          // broken on Android.
          if (onClosed) runOnJS(onClosed)();
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Drag-to-dismiss from anywhere on the sheet — identical mechanics to
  // AddModal's: the Pan only activates once a touch has clearly moved down
  // (12px), so taps and upward scrolling fall through untouched, and it's
  // simultaneous with the ScrollView's own native gesture so a drag that
  // starts inside the ScrollView still reaches this Pan.
  const nativeScroll = Gesture.Native();
  const pan = Gesture.Pan()
    .activeOffsetY(12)
    .failOffsetY(-12)
    .simultaneousWithExternalGesture(nativeScroll)
    .onUpdate(e => {
      if (e.translationY > 0) dragY.value = e.translationY;
    })
    .onEnd(e => {
      if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
        dragY.value = withTiming(OFF_SCREEN_Y, { duration: 700, easing: SETTLE_EASING });
        runOnJS(onClose)();
      } else {
        dragY.value = withTiming(0, { duration: 420, easing: SETTLE_EASING });
      }
    });

  const pageStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pageTranslateY.value + dragY.value }],
  }));

  const year = view.getFullYear();
  const month = view.getMonth();
  // getDay() is Sunday-indexed (0-6) — remap so Monday is column 0, matching
  // the Monday-first DAYS header below.
  const rawFirstDay = new Date(year, month, 1).getDay();
  const firstDay = rawFirstDay === 0 ? 6 : rawFirstDay - 1;
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

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      {/* RN's <Modal> stays fully touch-active for its whole lifetime —
          `visible` only flips to false once the close animation below has
          actually finished, so without this the calendar icon (and anything
          else on Dashboard) is unreachable for the ~700ms this is sliding
          off-screen, even though it's already invisible. `open` (not
          `visible`) flips to false the instant a close starts, so touches
          fall through immediately instead of at the end. Same fix as
          AddModal's — see the comment there. */}
      <Animated.View className="flex-1 bg-bg" style={pageStyle} pointerEvents={open ? 'auto' : 'none'}>
        <GestureDetector gesture={pan}>
          <View style={{ flex: 1 }}>
            <View style={{ paddingTop: insets.top + 10, paddingBottom: 8, alignItems: 'center' }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' }} />
            </View>

            {/* Fixed — not inside any ScrollView, so it never scrolls or
                shifts regardless of how many transactions the day list
                below ends up showing. */}
            <View style={{ paddingHorizontal: 20, marginTop: windowHeight * 0.1 }}>
                {recap?.available && (
                  <Pressable
                    onPress={recap.onOpen}
                    className="flex-row items-center justify-center mb-4"
                    style={{ gap: 5, alignSelf: 'center' }}
                  >
                    {!recap.seen && (
                      <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#a855f7' }} />
                    )}
                    <Text className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      Monthly Summary ›
                    </Text>
                  </Pressable>
                )}

                {/* Budget + calendar grouped into one padded surface,
                    rather than sitting loose against the page. */}
                <View className="rounded-3xl p-4 bg-bg" style={{ maxWidth: 320, alignSelf: 'center', width: '100%' }}>
                  {budget && <BudgetStatusBar {...budget} />}

                  <View className="flex-row items-center justify-between mb-4">
                    <Pressable
                      onPress={prevMonth}
                      className="w-7 h-7 rounded-full items-center justify-center"
                      style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
                    >
                      <Text style={{ color: 'rgba(255,255,255,0.5)' }}>‹</Text>
                    </Pressable>
                    <Text className="text-white/80 text-base font-semibold">
                      {MONTHS[month]} {year}
                    </Text>
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
                        <Text className="text-center text-white/25 text-[11px] font-medium">
                          {d}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {weeks.map((week, wi) => (
                    <View key={wi} className="flex-row" style={{ gap: 5, marginBottom: 5 }}>
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
                            <Text style={{ color: shade.color, fontSize: 12, fontWeight: '500' }}>
                              {d}
                            </Text>
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
                </View>
                </View>

            {/* Tapping a date loads its transactions right below the fixed
                group, each row sliding up and fading in with a small
                stagger. Scrolls internally (rather than growing the page)
                once there are enough to overflow the remaining space. */}
            {selectedDate && (
              <View style={{ flex: 1, marginTop: 20, paddingHorizontal: 20 }}>
                <View style={{ maxWidth: 320, alignSelf: 'center', width: '100%', flex: 1 }}>
                  <Text className="text-white/70 text-base font-semibold mb-3">
                    {formatDateFull(selectedDate)}
                  </Text>
                  {dayTxs.length === 0 ? (
                    <Text className="text-white/30 text-base">
                      No transactions — spend-free day 🎉
                    </Text>
                  ) : (
                    <GestureDetector gesture={nativeScroll}>
                      <ScrollView
                        showsVerticalScrollIndicator={false}
                        style={{ flex: 1 }}
                        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
                      >
                        <View style={{ gap: 12 }}>
                          {dayTxs.map((tx, i) => (
                            <DayTransactionRow key={tx.id} tx={tx} index={i} />
                          ))}
                        </View>
                      </ScrollView>
                    </GestureDetector>
                  )}
                </View>
              </View>
            )}
          </View>
        </GestureDetector>
      </Animated.View>
    </Modal>
  );
}

export default memo(SpendCalendarModal);
