import { useCallback, useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { useTransactions } from '../../hooks/useTransactions';
import Header from '../../components/Header';
import SummaryCard from '../../components/SummaryCard';
import TransactionList from '../../components/TransactionList';
import AddModal from '../../components/AddModal';
import Drawer from '../../components/Drawer';
import SpendCalendarModal from '../../components/SpendCalendarModal';
import DailyInsightModal from '../../components/DailyInsightModal';
import MonthlyRecapModal from '../../components/MonthlyRecapModal';
import { PlusIcon } from '../../components/icons';
import { currentMonthYear, monthLabel, today } from '../../utils/format';
import { getDailyInsight } from '../../utils/insights';
import { getMonthlyRecapSlides, hasAnyRecapData, prevMonthYear, MONTH_NAMES } from '../../utils/monthlyRecap';

export default function Dashboard() {
  const { user } = useAuth();
  const { transactions, loading: txLoading, addTransaction, editTransaction, deleteTransaction } = useTransactions();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const { month: currMonth, year: currYear } = currentMonthYear();

  const [chartTab, setChartTab] = useState('expense');
  const [timeRange, setTimeRange] = useState('month');
  const [year, setYear] = useState(currYear);
  const [selectedMonth, setSelectedMonth] = useState(currMonth);
  const [selectedYear, setSelectedYear] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editData, setEditData] = useState(null);

  const [dailyInsight, setDailyInsight] = useState(null);
  const [recapOpen, setRecapOpen] = useState(false);
  const [recapSlides, setRecapSlides] = useState([]);
  const [recapMonthLabel, setRecapMonthLabel] = useState('');
  const [recapMonthName, setRecapMonthName] = useState('');
  const [recapAvailable, setRecapAvailable] = useState(false);
  const [recapSeen, setRecapSeen] = useState(false);

  // Mirrors web App.jsx's popup-trigger effect, rewritten against
  // AsyncStorage (async) instead of localStorage (sync). Recap takes
  // priority over the daily insight on the first open after a month
  // rollover; otherwise the daily insight shows once per day.
  useEffect(() => {
    if (!user || !transactions.length || txLoading) return;
    let cancelled = false;

    (async () => {
      const todayStr = today();
      const { month, year: cy } = currentMonthYear();
      const prev = prevMonthYear(month, cy);

      const availKey = `okana_recap_available_date_${user.id}`;
      const isAvailableToday = (await AsyncStorage.getItem(availKey)) === todayStr;

      if (isAvailableToday && hasAnyRecapData(transactions, prev.month, prev.year)) {
        const seenVal = await AsyncStorage.getItem(`okana_recap_seen_${user.id}_${todayStr}`);
        if (cancelled) return;
        setRecapSlides(getMonthlyRecapSlides(transactions, prev.month, prev.year));
        setRecapMonthLabel(monthLabel(prev.month, prev.year));
        setRecapMonthName(MONTH_NAMES[prev.month]);
        setRecapAvailable(true);
        setRecapSeen(seenVal === '1');
      } else if (!cancelled) {
        setRecapAvailable(false);
      }

      const shownKey = `okana_insight_shown_${user.id}`;
      const shownVal = await AsyncStorage.getItem(shownKey);
      if (shownVal === todayStr) return;
      await AsyncStorage.setItem(shownKey, todayStr);

      const recapShownKey = `okana_recap_shown_${user.id}`;
      const recapMonthId = `${prev.year}-${String(prev.month).padStart(2, '0')}`;
      const alreadyShown = (await AsyncStorage.getItem(recapShownKey)) === recapMonthId;

      if (!alreadyShown && hasAnyRecapData(transactions, prev.month, prev.year)) {
        await AsyncStorage.setItem(recapShownKey, recapMonthId);
        await AsyncStorage.setItem(availKey, todayStr);
        if (cancelled) return;
        setRecapSlides(getMonthlyRecapSlides(transactions, prev.month, prev.year));
        setRecapMonthLabel(monthLabel(prev.month, prev.year));
        setRecapMonthName(MONTH_NAMES[prev.month]);
        setRecapAvailable(true);
        setRecapSeen(false);
        setRecapOpen(true);
        return;
      }

      const insight = getDailyInsight(transactions, todayStr);
      if (insight && !cancelled) setDailyInsight(insight);
    })();

    return () => { cancelled = true; };
  }, [user, transactions, txLoading]);

  const closeRecap = useCallback(async () => {
    setRecapOpen(false);
    if (!user) return;
    const todayStr = today();
    await AsyncStorage.setItem(`okana_recap_seen_${user.id}_${todayStr}`, '1');
    setRecapSeen(true);
  }, [user]);

  const openRecapFromCalendar = useCallback(() => {
    setCalendarOpen(false);
    setRecapOpen(true);
  }, []);

  const recapForCalendar = recapAvailable
    ? { available: true, seen: recapSeen, monthName: recapMonthName, onOpen: openRecapFromCalendar }
    : null;

  const handleTimeRangeChange = useCallback((next) => {
    setTimeRange(next);
    setSelectedDay(null);
    if (next === 'year') {
      setYear(currYear);
      setSelectedMonth(currMonth);
    }
  }, [currYear, currMonth]);

  const openAdd = useCallback(() => {
    setEditData(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((tx) => {
    setEditData(tx);
    setModalOpen(true);
  }, []);

  // Stable no-arg toggles for the modal props below — each was previously
  // an inline arrow function created fresh every render, which defeated
  // memo() on Header/AddModal/SpendCalendarModal/Drawer/DailyInsightModal:
  // any unrelated Dashboard state change (e.g. switching chart tabs) handed
  // them a "new" onClose/onMenuOpen prop and forced a full re-render of
  // each of those subtrees, AddModal's ~10-BlurView tree being the worst
  // of it.
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const openCalendar = useCallback(() => setCalendarOpen(true), []);
  const closeCalendar = useCallback(() => setCalendarOpen(false), []);
  const closeAddModal = useCallback(() => setModalOpen(false), []);
  const closeDailyInsight = useCallback(() => setDailyInsight(null), []);

  return (
    <View className="flex-1 bg-bg">
      <Header
        onMenuOpen={openDrawer}
        chartTab={chartTab}
        onChartTabChange={setChartTab}
        onCalendarOpen={openCalendar}
      />

      <SummaryCard
        transactions={transactions}
        chartTab={chartTab}
        timeRange={timeRange}
        onTimeRangeChange={handleTimeRangeChange}
        selectedMonth={selectedMonth}
        year={year}
        onMonthChange={setSelectedMonth}
        selectedYear={selectedYear}
        onYearChange={setSelectedYear}
        selectedDay={selectedDay}
        onDayChange={setSelectedDay}
      />

      <TransactionList
        transactions={transactions}
        activeTab={chartTab}
        chartTab={chartTab}
        selectedMonth={timeRange === 'month' ? currMonth : selectedMonth}
        year={timeRange === '5y' ? currYear : year}
        timeRange={timeRange}
        selectedYear={selectedYear}
        selectedDay={selectedDay}
        onEdit={openEdit}
      />

      <Pressable
        onPress={openAdd}
        className="absolute bottom-20 self-center w-20 h-20 rounded-full items-center justify-center"
        style={{ backgroundColor: 'rgba(255,255,255,0.24)', left: '50%', marginLeft: -40 }}
      >
        <PlusIcon size={30} />
      </Pressable>

      <AddModal
        open={modalOpen}
        onClose={closeAddModal}
        onAdd={addTransaction}
        onEdit={editTransaction}
        onDelete={deleteTransaction}
        editData={editData}
      />

      <SpendCalendarModal
        open={calendarOpen}
        onClose={closeCalendar}
        transactions={transactions}
        recap={recapForCalendar}
      />

      <DailyInsightModal insight={dailyInsight} onClose={closeDailyInsight} />

      <Drawer open={drawerOpen} onClose={closeDrawer} />

      <MonthlyRecapModal
        open={recapOpen}
        slides={recapSlides}
        monthLabel={recapMonthLabel}
        onClose={closeRecap}
      />
    </View>
  );
}
