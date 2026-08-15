import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { BackIcon } from '../../components/icons';

// Placeholder — full Settings build (legal/info modals, CSV export,
// feedback) is Step 6.
export default function SettingsPage() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-bg">
      <View className="flex-row items-center gap-2 px-4 pt-14 pb-4">
        <Pressable onPress={() => router.back()} className="w-9 h-9 items-center justify-center rounded-xl">
          <BackIcon />
        </Pressable>
        <Text className="text-white text-base font-semibold">Settings</Text>
      </View>
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-white/30 text-sm text-center">More settings are coming soon.</Text>
      </View>
    </View>
  );
}
