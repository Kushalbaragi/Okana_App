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
      <Text className="text-white/60 text-[13px]">{children}</Text>
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
    <AnimatedModal open onClose={onContinue} variant="center" blurIntensity={20} dim={0.7}>
      <View
        className="w-full rounded-3xl px-6 py-8 items-center"
        style={{ maxWidth: 320, backgroundColor: '#1c1c1f', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}
      >
        <Text style={{ fontSize: 36, marginBottom: 16 }}>🎉</Text>
        <Text className="text-white text-lg font-semibold mb-2">Welcome, {name}!</Text>
        <Text className="text-white/45 text-sm text-center mb-6" style={{ lineHeight: 20 }}>
          Your money, beautifully tracked. Let's get your account set up.
        </Text>
        <Pressable
          onPress={onContinue}
          className="w-full py-[13px] rounded-2xl items-center"
          style={{ backgroundColor: 'rgba(255,255,255,0.14)' }}
        >
          <Text className="text-white text-sm font-semibold">Start Tracking</Text>
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
        <Text className="text-white text-xl font-semibold text-center mb-2">Start your 30-day free trial</Text>
        <Text className="text-white/40 text-sm text-center mb-8" style={{ lineHeight: 20 }}>
          Full access to Okana Plus, free for 30 days. Native in-app purchases are coming soon — for now,
          subscribing is available on the web at the same ₹{PRICE_PER_YEAR}/year price.
        </Text>

        <View className="mb-8 self-center" style={{ gap: 10 }}>
          {FEATURES.map(f => <Feature key={f}>{f}</Feature>)}
        </View>

        <View
          className="w-full py-[14px] rounded-2xl items-center mb-3"
          style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <Text className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.35)' }}>Coming soon</Text>
        </View>

        <Pressable onPress={finish}>
          <Text className="text-white/40 text-sm text-center">Skip for now</Text>
        </Pressable>
      </View>
    </View>
  );
}
