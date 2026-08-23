import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { PRICE_PER_YEAR } from '../../utils/trial';
import { CheckIcon } from '../../components/icons';
import { AnimatedModal } from '../../components/AnimatedModal';

function Feature({ children }) {
  return (
    <View className="flex-row items-center" style={{ gap: 10 }}>
      <View className="w-4 h-4 rounded-full items-center justify-center" style={{ backgroundColor: 'rgba(74,222,128,0.12)' }}>
        <CheckIcon size={13} />
      </View>
      <Text className="text-white/60 text-base">{children}</Text>
    </View>
  );
}

const FEATURES = [
  'Unlimited transaction history',
  'Spending calendar & insights',
  'Priority support',
];

function WelcomeModal({ name, onContinue }) {
  return (
    <AnimatedModal open onClose={onContinue} variant="center" dim={0.7}>
      <View
        className="w-full rounded-3xl px-6 py-8 items-center"
        style={{ maxWidth: 320, backgroundColor: '#1c1c1f', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}
      >
        <Text style={{ fontSize: 36, marginBottom: 16 }}>🎉</Text>
        <Text className="text-white text-lg font-semibold mb-2">Welcome, {name}!</Text>
        <Text className="text-white/45 text-base text-center mb-6" style={{ lineHeight: 22 }}>
          Your money, beautifully tracked. Let's get your account set up.
        </Text>
        <Pressable
          onPress={onContinue}
          className="w-full py-[13px] rounded-2xl items-center"
          style={{ backgroundColor: '#ffffff' }}
        >
          <Text className="text-black text-base font-semibold">Start Tracking</Text>
        </Pressable>
      </View>
    </AnimatedModal>
  );
}

export default function WelcomeScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const [showWelcome, setShowWelcome] = useState(true);
  const firstName = (profile?.name || 'there').split(' ')[0];

  function finish() {
    router.replace('/(app)');
  }

  return (
    <View className="flex-1 bg-bg justify-center items-center px-6">
      {showWelcome && <WelcomeModal name={firstName} onContinue={() => setShowWelcome(false)} />}

      <View className="w-full" style={{ maxWidth: 380 }}>
        <View
          className="w-14 h-14 rounded-2xl items-center justify-center mb-5"
          style={{ alignSelf: 'center', backgroundColor: 'rgba(74,222,128,0.10)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.20)' }}
        >
          <Text style={{ fontSize: 24 }}>✨</Text>
        </View>
        <Text className="text-white text-xl font-semibold text-center mb-2">Your 30-day free trial is active</Text>
        <Text className="text-white/40 text-base text-center mb-8" style={{ lineHeight: 22 }}>
          Full access to Okana Plus, on us, for 30 days — no card needed. Subscribing afterwards is available
          on the web at ₹{PRICE_PER_YEAR}/year; native in-app purchases are coming soon.
        </Text>

        <View className="mb-8 self-center" style={{ gap: 10 }}>
          {FEATURES.map(f => <Feature key={f}>{f}</Feature>)}
        </View>

        <Pressable
          onPress={finish}
          className="w-full py-[14px] rounded-2xl items-center"
          style={{ backgroundColor: '#ffffff' }}
        >
          <Text className="text-black text-base font-semibold">Start Tracking</Text>
        </Pressable>
      </View>
    </View>
  );
}
