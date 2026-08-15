import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTransactions } from '../../hooks/useTransactions';
import Header from '../../components/Header';
import SummaryCard from '../../components/SummaryCard';
import TransactionList from '../../components/TransactionList';
import AddModal from '../../components/AddModal';
import Drawer from '../../components/Drawer';
import { currentMonthYear } from '../../utils/format';

export default function Dashboard() {
  const { logout } = useAuth();
  const { transactions, addTransaction, editTransaction, deleteTransaction } = useTransactions();

  const [drawerOpen, setDrawerOpen] = useState(false);

  const { month: currMonth, year: currYear } = currentMonthYear();

  const [chartTab, setChartTab] = useState('expense');
  const [timeRange, setTimeRange] = useState('month');
  const [year, setYear] = useState(currYear);
  const [selectedMonth, setSelectedMonth] = useState(currMonth);
  const [selectedYear, setSelectedYear] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editData, setEditData] = useState(null);

  function handleTimeRangeChange(next) {
    setTimeRange(next);
    setSelectedDay(null);
    if (next === 'year') setYear(currYear);
  }

  function openAdd() {
    setEditData(null);
    setModalOpen(true);
  }

  function openEdit(tx) {
    setEditData(tx);
    setModalOpen(true);
  }

  return (
    <View className="flex-1 bg-bg">
      <Header
        onMenuOpen={() => setDrawerOpen(true)}
        chartTab={chartTab}
        onChartTabChange={setChartTab}
        onCalendarOpen={() => {}}
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
        className="absolute bottom-8 self-center w-14 h-14 rounded-full items-center justify-center"
        style={{ backgroundColor: 'rgba(255,255,255,0.14)', left: '50%', marginLeft: -28 }}
      >
        <Text className="text-white text-3xl" style={{ marginTop: -2 }}>+</Text>
      </Pressable>

      <AddModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdd={addTransaction}
        onEdit={editTransaction}
        onDelete={deleteTransaction}
        editData={editData}
      />

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </View>
  );
}
