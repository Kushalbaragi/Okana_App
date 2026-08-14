import { View, Text } from 'react-native';
import { useAuth } from '../../context/AuthContext';

// Placeholder authenticated shell — the real dashboard (Header, SummaryCard,
// TransactionList, FAB) is built in Step 2/3.
export default function Dashboard() {
  const { profile } = useAuth();

  return (
    <View className="flex-1 bg-bg items-center justify-center px-6">
      <Text className="text-white text-lg font-semibold mb-1">Welcome back{profile ? `, ${profile.name}` : ''}</Text>
      <Text className="text-white/40 text-sm">Dashboard coming in Step 2.</Text>
    </View>
  );
}
