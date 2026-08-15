import { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../hooks/useSubscription';
import { PRICE_PER_YEAR, formatChargeDate, getSubscriptionDisplayStatus } from '../../utils/trial';
import { today } from '../../utils/format';
import { BackIcon } from '../../components/icons';
import { AnimatedModal } from '../../components/AnimatedModal';

function Divider() {
  return <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginHorizontal: 16 }} />;
}

function SectionLabel({ children }) {
  return <Text className="text-white/30 text-[11px] font-medium uppercase tracking-widest px-1 pt-2 mb-2">{children}</Text>;
}

function Card({ children }) {
  return (
    <View className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' }}>
      {children}
    </View>
  );
}

function Pill({ children, tone = 'green' }) {
  const style = tone === 'green'
    ? { backgroundColor: 'rgba(74,222,128,0.14)', color: '#4ade80' }
    : { backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' };
  return (
    <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: style.backgroundColor }}>
      <Text className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: style.color }}>{children}</Text>
    </View>
  );
}

const PLAN_PILL = {
  not_started: { label: 'Free', tone: 'grey' },
  trial: { label: 'Trial', tone: 'green' },
  subscribed: { label: 'Pro', tone: 'green' },
  expired: { label: 'Free', tone: 'grey' },
};

const CARD_NETWORK_LABEL = { visa: 'VISA', mastercard: 'MC', amex: 'AMEX', rupay: 'RUPAY', diners: 'DINERS' };

export default function SubscriptionPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { subscription, cancelling, error, paymentMethod, cancelSubscription } = useSubscription(user);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelSuccess, setCancelSuccess] = useState(false);

  const trialInfo = subscription ? getSubscriptionDisplayStatus(subscription, today()) : { status: 'not_started' };
  const status = trialInfo.status;
  const isEnding = trialInfo.cancelAtPeriodEnd && (status === 'trial' || status === 'subscribed');
  const pill = isEnding ? { label: 'Ending', tone: 'grey' } : PLAN_PILL[status];
  const canCancel = (status === 'trial' || status === 'subscribed') && !trialInfo.cancelAtPeriodEnd;
  const needsAction = status === 'not_started' || status === 'expired';

  async function handleConfirmCancel() {
    const ok = await cancelSubscription({ immediate: false });
    setConfirmOpen(false);
    if (ok) {
      setCancelSuccess(true);
      setTimeout(() => setCancelSuccess(false), 4000);
    }
  }

  return (
    <View className="flex-1 bg-bg">
      <ScrollView>
        <View className="flex-row items-center gap-2 px-4 pt-14 pb-4">
          <Pressable onPress={() => router.back()} className="w-9 h-9 items-center justify-center rounded-xl">
            <BackIcon />
          </Pressable>
          <Text className="text-white text-base font-semibold">Subscription</Text>
        </View>

        <View className="px-4 pb-16" style={{ gap: 12 }}>
          {!!error && (
            <View className="rounded-xl px-4 py-3" style={{ backgroundColor: 'rgba(248,113,113,0.08)', borderWidth: 1, borderColor: 'rgba(248,113,113,0.2)' }}>
              <Text className="text-red-300 text-[13px]">{error}</Text>
            </View>
          )}

          {cancelSuccess && (
            <View className="rounded-xl px-4 py-3" style={{ backgroundColor: 'rgba(74,222,128,0.08)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.25)' }}>
              <Text className="text-[13px]" style={{ color: '#4ade80' }}>You've successfully unsubscribed</Text>
            </View>
          )}

          <View>
            <SectionLabel>Current Plan</SectionLabel>
            <Card>
              <View className="flex-row items-center justify-between px-4 py-[14px]">
                <Text className="text-white text-sm">{needsAction ? 'Okana' : 'Okana Plus'}</Text>
                <Pill tone={pill.tone}>{pill.label}</Pill>
              </View>

              {status === 'trial' && (
                <>
                  <Divider />
                  <View className="px-4 py-[14px]">
                    <Text className="text-white/40 text-xs">
                      {trialInfo.cancelAtPeriodEnd
                        ? `Plus access ends ${formatChargeDate(trialInfo.chargeDate)} — you won't be charged`
                        : `You'll be charged ₹${PRICE_PER_YEAR} on ${formatChargeDate(trialInfo.chargeDate)}`}
                    </Text>
                  </View>
                </>
              )}
              {status === 'subscribed' && trialInfo.cancelAtPeriodEnd && (
                <>
                  <Divider />
                  <View className="px-4 py-[14px]">
                    <Text className="text-white/40 text-xs">Access until {formatChargeDate(trialInfo.chargeDate)}</Text>
                  </View>
                </>
              )}
            </Card>
          </View>

          {(paymentMethod || status === 'trial' || status === 'subscribed') && (
            <View>
              <SectionLabel>Payment Method</SectionLabel>
              <Card>
                {paymentMethod ? (
                  <View className="flex-row items-center justify-between px-4 py-[14px]">
                    <View className="flex-row items-center" style={{ gap: 12 }}>
                      <View className="px-2 py-1 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                        <Text className="text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.55)' }}>
                          {paymentMethod.card
                            ? (CARD_NETWORK_LABEL[paymentMethod.card.network?.toLowerCase()] || 'CARD')
                            : (paymentMethod.method || 'UPI').toUpperCase()}
                        </Text>
                      </View>
                      <Text className="text-white/70 text-sm">
                        {paymentMethod.card ? `•••• ${paymentMethod.card.last4}` : paymentMethod.vpa || 'Linked'}
                      </Text>
                    </View>
                    {trialInfo.paymentFailed && (
                      <Text className="text-[12px] font-medium" style={{ color: 'rgba(248,113,113,0.85)' }}>Payment failed</Text>
                    )}
                  </View>
                ) : (
                  <View className="px-4 py-[14px]">
                    <Text className="text-white/30 text-[13px]">No payment method on file</Text>
                  </View>
                )}
              </Card>
            </View>
          )}

          {needsAction && (
            <View style={{ gap: 8 }}>
              <View
                className="w-full py-[13px] rounded-2xl items-center"
                style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}
              >
                <Text className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.35)' }}>Coming soon</Text>
              </View>
              <Text className="w-full text-center text-white/25 text-xs">
                Subscribing from the app is on its way — manage your plan from the web for now.
              </Text>
            </View>
          )}

          {canCancel && (
            <View>
              <SectionLabel>Cancel Plan</SectionLabel>
              <Card>
                <View className="flex-row items-center justify-between gap-3 px-4 py-[14px]">
                  <Text className="text-white/40 text-xs flex-1" style={{ lineHeight: 18 }}>
                    If you cancel, you'll keep full access until {formatChargeDate(trialInfo.chargeDate)}.
                  </Text>
                  <Pressable
                    onPress={() => setConfirmOpen(true)}
                    className="px-3 py-[7px] rounded-full"
                    style={{ borderWidth: 1, borderColor: 'rgba(248,113,113,0.35)' }}
                  >
                    <Text className="text-[12px] font-medium" style={{ color: 'rgba(248,113,113,0.85)' }}>Cancel</Text>
                  </Pressable>
                </View>
              </Card>
            </View>
          )}
        </View>
      </ScrollView>

      <AnimatedModal open={confirmOpen} onClose={() => setConfirmOpen(false)} variant="center">
        <View
          className="w-full rounded-2xl p-6"
          style={{ maxWidth: 360, backgroundColor: 'rgba(20,20,20,0.98)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }}
        >
          <Text className="text-white font-semibold text-base mb-2">
            End access on {trialInfo.chargeDate ? formatChargeDate(trialInfo.chargeDate) : 'period end'}?
          </Text>
          <Text className="text-white/45 text-sm mb-6" style={{ lineHeight: 20 }}>
            If you cancel now, you'll still be able to access all features until {trialInfo.chargeDate ? formatChargeDate(trialInfo.chargeDate) : 'then'}.
          </Text>
          <View className="flex-row" style={{ gap: 12 }}>
            <Pressable onPress={() => setConfirmOpen(false)} className="flex-1 py-3 rounded-xl items-center" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
              <Text className="text-white/60 text-sm font-medium">Go back</Text>
            </Pressable>
            <Pressable onPress={handleConfirmCancel} disabled={cancelling} className="flex-1 py-3 rounded-xl items-center" style={{ backgroundColor: 'rgba(248,113,113,0.14)', opacity: cancelling ? 0.5 : 1 }}>
              <Text className="text-sm font-semibold" style={{ color: 'rgba(248,113,113,0.9)' }}>{cancelling ? 'Cancelling…' : 'Cancel subscription'}</Text>
            </Pressable>
          </View>
        </View>
      </AnimatedModal>
    </View>
  );
}
