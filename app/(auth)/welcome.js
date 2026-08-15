import { useRouter } from 'expo-router';
import { View, Text } from 'react-native';
import { GlassPressable } from '../../components/Glass';

// Placeholder — the real post-signup trial-offer screen (with the
// subscription purchase-CTA stub) is built in Step 4.
export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-bg justify-center items-center px-6">
      <Text className="text-white text-xl font-semibold mb-2">Welcome to Okana</Text>
      <Text className="text-white/40 text-sm text-center mb-8">Let's get your account set up.</Text>
      <GlassPressable
        variant="active"
        radius={16}
        onPress={() => router.replace('/(app)')}
        className="w-full max-w-[400px] py-[14px] items-center"
      >
        <Text className="text-white text-sm font-semibold">Start Tracking</Text>
      </GlassPressable>
    </View>
  );
}
