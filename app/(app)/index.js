import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTransactions } from '../../hooks/useTransactions';
import TransactionList from '../../components/TransactionList';
import AddModal from '../../components/AddModal';
import { formatCurrency, getMonthTotal, monthLabel, currentMonthYear } from '../../utils/format';

const TABS = ['expense', 'income', 'overview'];

export default function Dashboard() {
  const { logout } = useAuth();
  const { transactions, addTransaction, editTransaction, deleteTransaction } = useTransactions();

  const { month: currMonth, year: currYear } = currentMonthYear();
  const [activeTab, setActiveTab] = useState('expense');
  const [modalOpen, setModalOpen] = useState(false);
  const [editData, setEditData] = useState(null);

  const total = activeTab === 'overview'
    ? getMonthTotal(transactions, 'income', currMonth, currYear) - getMonthTotal(transactions, 'expense', currMonth, currYear)
    : getMonthTotal(transactions, activeTab, currMonth, currYear);

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
      <View className="flex-row items-center justify-between px-4 pt-14 pb-2">
        <View className="flex-row" style={{ gap: 6 }}>
          {TABS.map(tab => (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              className="px-3 py-1.5 rounded-full"
              style={activeTab === tab ? { backgroundColor: 'rgba(255,255,255,0.14)' } : null}
            >
              <Text className={activeTab === tab ? 'text-white text-xs font-semibold capitalize' : 'text-white/40 text-xs font-medium capitalize'}>
                {tab}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={logout}>
          <Text className="text-white/30 text-xs">Log Out</Text>
        </Pressable>
      </View>

      <View className="items-center py-6">
        <Text className="text-white/40 text-sm mb-1">{monthLabel(currMonth, currYear)}</Text>
        <Text
          className="text-4xl font-semibold tracking-tight"
          style={activeTab === 'overview' ? { color: total >= 0 ? '#4ade80' : '#f87171' } : { color: '#ffffff' }}
        >
          {formatCurrency(Math.abs(total))}
        </Text>
      </View>

      <TransactionList
        transactions={transactions}
        activeTab={activeTab}
        chartTab={activeTab}
        selectedMonth={currMonth}
        year={currYear}
        timeRange="month"
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
    </View>
  );
}
