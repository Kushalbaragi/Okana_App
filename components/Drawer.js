import { memo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../hooks/useSubscription';
import { getSubscriptionDisplayStatus } from '../utils/trial';
import { today } from '../utils/format';
import { GlassView } from './Glass';

function Divider() {
  return <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginHorizontal: 16 }} />;
}

function Item({ onPress, children }) {
  return (
    <Pressable onPress={onPress} className="px-5 py-[14px]" style={({ pressed }) => (pressed ? { backgroundColor: 'rgba(255,255,255,0.06)' } : null)}>
      {children}
    </Pressable>
  );
}

function Drawer({ open, onClose }) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { subscription } = useSubscription(user);

  const trialInfo = subscription ? getSubscriptionDisplayStatus(subscription, today()) : null;
  const planLabel = trialInfo
    ? (trialInfo.status === 'subscribed' ? 'Pro' : trialInfo.status === 'trial' ? 'Trial' : null)
    : null;

  function openPage(path) {
    onClose();
    router.push(path);
  }

  async function handleLogout() {
    onClose();
    try {
      await logout();
    } catch {
      // Sign-out failing (e.g. offline) shouldn't trap the user behind a
      // closed drawer with no way forward — still navigate away.
    }
    router.replace('/(auth)/login');
  }

  if (!open) return null;

  return (
    <>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

      <GlassView
        variant="modal"
        radius={16}
        style={{ position: 'absolute', top: 52, left: 16, minWidth: 190 }}
      >
        <Item onPress={() => openPage('/(app)/account')}>
          <Text className="text-white text-base">Account</Text>
        </Item>
        <Divider />
        <Item onPress={() => openPage('/(app)/subscription')}>
          <View className="flex-row items-center justify-between" style={{ gap: 8 }}>
            <Text className="text-white text-base">Subscription</Text>
            {planLabel && (
              <View
                className="px-2 py-0.5 rounded-full"
                style={planLabel === 'Pro' ? { backgroundColor: 'rgba(74,222,128,0.14)' } : { backgroundColor: 'rgba(255,255,255,0.08)' }}
              >
                <Text
                  className="text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: planLabel === 'Pro' ? 'rgba(74,222,128,0.9)' : 'rgba(255,255,255,0.5)' }}
                >
                  {planLabel}
                </Text>
              </View>
            )}
          </View>
        </Item>
        <Divider />
        <Item onPress={() => openPage('/(app)/settings')}>
          <Text className="text-white text-base">Settings</Text>
        </Item>
        <Divider />
        <Item onPress={handleLogout}>
          <Text className="text-base" style={{ color: 'rgba(248,113,113,0.8)' }}>Log Out</Text>
        </Item>
      </GlassView>
    </>
  );
}

export default memo(Drawer);
