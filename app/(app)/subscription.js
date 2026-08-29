import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Platform, ActivityIndicator, StyleSheet, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { useSubscription } from '../../hooks/useSubscription';
import { usePurchases, openManageSubscription } from '../../hooks/usePurchases';
import { formatChargeDate, getSubscriptionDisplayStatus } from '../../utils/trial';
import { today } from '../../utils/format';
import { BackIcon, ChevronRight } from '../../components/icons';
import { PaymentProcessing } from '../../components/PaymentProcessing';

function Divider() {
  return <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginHorizontal: 16 }} />;
}

function SectionLabel({ children }) {
  return (
    <Text
      className="text-white/30 text-[11px] font-medium uppercase tracking-widest px-1 pt-2 mb-2">{children}</Text>
  );
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

// 'trial' is a billing-mechanics detail, not something shown to the user —
// Active covers it the same as a fully paid subscription.
const PLAN_PILL = {
  not_started: { label: 'Free', tone: 'grey' },
  trial: { label: 'Active', tone: 'green' },
  subscribed: { label: 'Active', tone: 'green' },
  expired: { label: 'Free', tone: 'grey' },
};

export default function SubscriptionPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { isOnline, notifyOffline } = useNetwork();
  const { subscription, loading, refresh } = useSubscription(user);
  const { getOfferings, purchasePackage, restorePurchases } = usePurchases(user?.id);
  const [processingVisible, setProcessingVisible] = useState(false);
  const [purchaseSucceeded, setPurchaseSucceeded] = useState(false);

  const trialInfo = subscription ? getSubscriptionDisplayStatus(subscription, today()) : { status: 'not_started' };
  const status = trialInfo.status;
  const isEnding = trialInfo.cancelAtPeriodEnd && (status === 'trial' || status === 'subscribed');
  const pill = isEnding ? { label: 'Ending', tone: 'grey' } : PLAN_PILL[status];
  const canManage = status === 'trial' || status === 'subscribed';
  const needsAction = status === 'not_started' || status === 'expired';

  const [pkg, setPkg] = useState(null);
  const [offeringLoading, setOfferingLoading] = useState(false);
  const [offeringError, setOfferingError] = useState(null);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web' || loading || !needsAction) return;
    let cancelled = false;
    setOfferingLoading(true);
    setOfferingError(null);
    (async () => {
      const result = await getOfferings();
      if (cancelled) return;
      if (result.success && result.offering?.availablePackages?.length) {
        setPkg(result.offering.availablePackages[0]);
      } else {
        setOfferingError(result.error || 'Subscription options aren’t available right now.');
      }
      setOfferingLoading(false);
    })();
    return () => { cancelled = true; };
    // isOnline is a dependency so a failed fetch (offline) automatically
    // retries once connectivity returns, instead of leaving the user stuck
    // on "unavailable" until they leave and revisit this screen.
  }, [needsAction, getOfferings, loading, isOnline]);

  async function handleSubscribe() {
    if (!pkg) return;
    if (!isOnline) { notifyOffline(); return; }
    setPurchaseError(null);
    // Opens the full-screen processing takeover immediately, before the
    // purchase sheet even resolves — see PaymentProcessing.
    setProcessingVisible(true);
    setPurchasing(true);
    const result = await purchasePackage(pkg);
    if (!result.success) {
      setPurchasing(false);
      setProcessingVisible(false);
      if (!result.cancelled) setPurchaseError(result.error || 'Purchase failed. Please try again.');
      return;
    }
    // The subscriptions table write happens asynchronously via
    // revenuecat-webhook, not synchronously with the purchase completing on
    // device — poll refresh() briefly instead of a single immediate call so
    // this screen doesn't flash stale "not subscribed" state right after a
    // real purchase succeeds. Stops early the moment the webhook's write
    // actually lands, rather than always waiting out the full 5s.
    // A normal (non-error) webhook delivery can still take several seconds
    // to land — 15 one-second attempts gives real-world RevenueCat webhook
    // latency room to land within before this gives up on it, rather than
    // second-guessing a purchase that actually just succeeded.
    let confirmed = false;
    for (let i = 0; i < 15; i++) {
      const data = await refresh();
      if (['trial', 'subscribed'].includes(getSubscriptionDisplayStatus(data, today()).status)) {
        confirmed = true;
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    setPurchasing(false);
    if (confirmed) {
      setPurchaseSucceeded(true);
    } else {
      // Webhook never confirmed within the poll window — don't strand the
      // user on a success animation that was never earned.
      setProcessingVisible(false);
      setPurchaseError('Purchase is taking longer than expected to confirm. Pull to refresh in a moment.');
    }
  }

  function handleProcessingDone() {
    setProcessingVisible(false);
    setPurchaseSucceeded(false);
  }

  async function handleRestore() {
    if (!isOnline) { notifyOffline(); return; }
    setRestoring(true);
    setPurchaseError(null);
    const result = await restorePurchases();
    if (result.success) await refresh();
    else setPurchaseError(result.error || 'Could not restore purchases.');
    setRestoring(false);
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

        {loading ? (
          <View className="items-center" style={{ paddingTop: 80 }}>
            <ActivityIndicator color="rgba(255,255,255,0.4)" />
          </View>
        ) : (
        <View className="px-4 pb-16" style={{ gap: 12 }}>
          <View>
            <SectionLabel>Current Plan</SectionLabel>
            <Card>
              <View className="flex-row items-center justify-between px-4 py-[14px]">
                <Text className="text-white text-base">{needsAction ? 'Okana' : 'Okana Plus'}</Text>
                <Pill tone={pill.tone}>{pill.label}</Pill>
              </View>

              {(status === 'trial' || status === 'subscribed') && trialInfo.cancelAtPeriodEnd && (
                <>
                  <Divider />
                  <View className="px-4 py-[14px]">
                    <Text className="text-white/40 text-base">Access until {formatChargeDate(trialInfo.chargeDate)}</Text>
                  </View>
                </>
              )}
              {status === 'subscribed' && trialInfo.paymentFailed && (
                <>
                  <Divider />
                  <View className="px-4 py-[14px]">
                    <Text className="text-base" style={{ color: 'rgba(248,113,113,0.85)' }}>
                      There's a problem with your payment — update it in {Platform.OS === 'ios' ? 'the App Store' : 'Play Store'} to keep your access.
                    </Text>
                  </View>
                </>
              )}
            </Card>
          </View>

          {needsAction && Platform.OS !== 'web' && (
            <View style={{ gap: 8 }}>
              {!!purchaseError && (
                <View className="rounded-xl px-4 py-3" style={{ backgroundColor: 'rgba(248,113,113,0.08)', borderWidth: 1, borderColor: 'rgba(248,113,113,0.2)' }}>
                  <Text className="text-red-300 text-base">{purchaseError}</Text>
                </View>
              )}

              {offeringLoading ? (
                <View className="w-full py-[13px] rounded-2xl items-center" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                  <ActivityIndicator color="rgba(255,255,255,0.5)" />
                </View>
              ) : pkg ? (
                <Pressable
                  onPress={handleSubscribe}
                  disabled={purchasing}
                  className="w-full py-[13px] rounded-2xl items-center"
                  style={{ backgroundColor: 'rgba(74,222,128,0.25)', opacity: purchasing ? 0.6 : 1 }}
                >
                  <Text className="text-base font-semibold" style={{ color: '#4ade80' }}>
                    Subscribe — {pkg.product.priceString}/year
                  </Text>
                </Pressable>
              ) : (
                <View
                  className="w-full py-[13px] rounded-2xl items-center"
                  style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}
                >
                  <Text className="text-base font-semibold" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    {offeringError || 'Subscription options unavailable'}
                  </Text>
                </View>
              )}

              <Pressable onPress={handleRestore} disabled={restoring} className="w-full py-2 items-center">
                <Text className="text-white/40 text-base">{restoring ? 'Restoring…' : 'Restore purchases'}</Text>
              </Pressable>
            </View>
          )}

          {needsAction && Platform.OS === 'web' && (
            <View style={{ gap: 8 }}>
              <View
                className="w-full py-[13px] rounded-2xl items-center"
                style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}
              >
                <Text className="text-base font-semibold" style={{ color: 'rgba(255,255,255,0.35)' }}>Not available on web</Text>
              </View>
              <Text className="w-full text-center text-white/25 text-base">
                Subscribing is only available from the iOS or Android app.
              </Text>
            </View>
          )}

          {canManage && Platform.OS !== 'web' && (
            <View>
              <SectionLabel>Manage Subscription</SectionLabel>
              <Card>
                <Pressable
                  onPress={() => (isOnline ? openManageSubscription() : notifyOffline())}
                  className="flex-row items-center justify-between gap-3 px-4 py-[14px]"
                >
                  <Text className="text-white/70 text-base flex-1" style={{ lineHeight: 20 }}>
                    Change plan, cancel, or update payment in {Platform.OS === 'ios' ? 'the App Store' : 'Play Store'}
                  </Text>
                  <ChevronRight />
                </Pressable>
              </Card>
            </View>
          )}

          <View>
            <SectionLabel>Legal</SectionLabel>
            <Card>
              <Pressable
                onPress={() => Linking.openURL('https://kushalbaragiokana.notion.site/Privacy-Policy-3c58f887c3c9806180c1ed51844d872e?source=copy_link')}
                className="flex-row items-center justify-between px-4 py-[14px]"
              >
                <Text className="text-white text-base">Privacy Policy</Text>
                <ChevronRight />
              </Pressable>
              <Divider />
              <Pressable
                onPress={() => Linking.openURL('https://kushalbaragiokana.notion.site/Terms-and-Condition-3c58f887c3c9806d86eae7473775949c?source=copy_link')}
                className="flex-row items-center justify-between px-4 py-[14px]"
              >
                <Text className="text-white text-base">Terms & Conditions</Text>
                <ChevronRight />
              </Pressable>
              <Divider />
              <Pressable
                onPress={() => Linking.openURL('https://kushalbaragiokana.notion.site/Refund-Cancellation-Policy-3c58f887c3c980c48cb6ded1520897ed?source=copy_link')}
                className="flex-row items-center justify-between px-4 py-[14px]"
              >
                <Text className="text-white text-base">Refunds & Cancellations</Text>
                <ChevronRight />
              </Pressable>
            </Card>
          </View>
        </View>
        )}
      </ScrollView>

      {processingVisible && (
        <View style={StyleSheet.absoluteFill}>
          <PaymentProcessing succeeded={purchaseSucceeded} onDone={handleProcessingDone} />
        </View>
      )}
    </View>
  );
}
