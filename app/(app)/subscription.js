import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, RefreshControl, Platform, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { useSubscription } from '../../hooks/useSubscription';
import { usePurchases, openManageSubscription } from '../../hooks/usePurchases';
import { formatChargeDate, getSubscriptionDisplayStatus, PRICE_PER_YEAR, WHY_ITEMS } from '../../utils/trial';
import { today } from '../../utils/format';
import { BackIcon, CheckIcon } from '../../components/icons';
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

export default function SubscriptionPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { isOnline, notifyOffline } = useNetwork();
  const { subscription, loading, refresh } = useSubscription(user);
  const { getOfferings, purchasePackage, restorePurchases } = usePurchases(user?.id);
  const [processingVisible, setProcessingVisible] = useState(false);
  const [purchaseSucceeded, setPurchaseSucceeded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const trialInfo = subscription ? getSubscriptionDisplayStatus(subscription, today()) : { status: 'not_started' };
  const status = trialInfo.status;
  // 'trial' here is always the app-granted trial (no store intro-offer is
  // configured), which has no real store subscription behind it — nothing
  // for the App/Play Store's manage-subscription screen to show. Only an
  // actual purchase gives the user something to manage.
  const canManage = status === 'subscribed';
  const needsAction = status === 'not_started' || status === 'expired';

  const [pkg, setPkg] = useState(null);
  const [offeringLoading, setOfferingLoading] = useState(false);
  const [offeringError, setOfferingError] = useState(null);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState(null);
  // Distinct from purchaseError — this is for the "payment went through,
  // our own DB just hasn't caught up yet" case, which isn't a failure and
  // shouldn't read as one.
  const [purchaseNotice, setPurchaseNotice] = useState(null);
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
    setPurchaseNotice(null);
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

    // Deliberately does NOT trust result.customerInfo's entitlement here —
    // RevenueCat can report an entitlement as active from a transferred or
    // otherwise stale purchase (e.g. a sandbox Apple ID that already had an
    // active subscription under a different app_user_id) without a new
    // purchase actually completing for this user. Our own `subscriptions`
    // row, written by revenuecat-webhook off a real purchase event, is the
    // only thing "successful" should ever be shown against — worth the
    // extra wait for a payment confirmation to actually be correct.
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
      setProcessingVisible(false);
      setPurchaseNotice('Payment received — just finishing up. This can take a minute; pull to refresh if it doesn\'t update.');
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
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="rgba(255,255,255,0.6)" />
        }
      >
        <View className="flex-row items-center gap-2 px-4 pt-14 pb-4">
          <Pressable onPress={() => router.back()} className="w-9 h-9 items-center justify-center rounded-xl">
            <BackIcon />
          </Pressable>
          <Text className="text-white text-base font-semibold">Subscription</Text>
        </View>

        {/* Gated on having no data at all yet, not on the network fetch
            itself — useSubscription fills `subscription` from AsyncStorage
            almost instantly on mount, well before the network round-trip
            (or its offline timeout) resolves. Waiting on `loading` alone
            meant this screen sat on a spinner behind a slow/failing
            request even when perfectly good cached data was already
            sitting there, unlike the Dashboard's own cache-first render. */}
        {loading && !subscription ? (
          <View className="items-center" style={{ paddingTop: 80 }}>
            <ActivityIndicator color="rgba(255,255,255,0.4)" />
          </View>
        ) : (
        <View className="px-4 pb-16" style={{ gap: 12 }}>
          <View>
            <SectionLabel>Current Plan</SectionLabel>
            <Card>
              {status === 'expired' ? (
                <View className="px-4 py-[18px] items-center">
                  <Text className="text-base font-semibold text-center" style={{ color: 'rgba(248,113,113,0.85)' }}>
                    Your Plan has Expired
                  </Text>
                </View>
              ) : (
                <View className="px-4 py-[18px] items-center">
                  <Text className="text-white text-base" style={{ textAlign: 'center' }}>
                    You are{' '}
                    <Text style={{ color: '#4ade80', fontWeight: '600' }}>
                      {needsAction ? 'Free' : 'Plus'}
                    </Text>
                    {' '}user of Okana
                  </Text>
                </View>
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

          {/* Pre-conversion pitch — only while there's still a decision to
              make (free, expired, or still in the trial). Not shown to an
              actual paying subscriber; see the thank-you card below instead. */}
          {(needsAction || status === 'trial') && (
            <View>
              <SectionLabel>Features</SectionLabel>
              <Card>
                {WHY_ITEMS.map((item, i) => (
                  <View key={item.title}>
                    {i > 0 && <Divider />}
                    <View className="px-4 py-[14px]">
                      <View className="flex-row items-center" style={{ gap: 8 }}>
                        <CheckIcon size={20} />
                        <Text className="text-white font-medium" style={{ fontSize: 16 }}>{item.title}</Text>
                      </View>
                      <Text className="text-white/40 text-sm mt-1" style={{ lineHeight: 19, marginLeft: 24 }}>
                        {item.description}
                      </Text>
                    </View>
                  </View>
                ))}

                {needsAction && Platform.OS !== 'web' && (
                  <>
                    <Divider />
                    <View className="px-4 py-[14px]" style={{ gap: 8 }}>
                      {!!purchaseError && (
                        <View className="rounded-xl px-4 py-3" style={{ backgroundColor: 'rgba(248,113,113,0.08)', borderWidth: 1, borderColor: 'rgba(248,113,113,0.2)' }}>
                          <Text className="text-red-300 text-base">{purchaseError}</Text>
                        </View>
                      )}

                      {!!purchaseNotice && (
                        <View className="rounded-xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
                          <Text className="text-white/60 text-base">{purchaseNotice}</Text>
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
                    </View>
                  </>
                )}
              </Card>

              {status === 'trial' && (
                <Text className="text-white/40 text-sm text-center" style={{ marginTop: 14 }}>
                  {trialInfo.cancelAtPeriodEnd
                    ? `Access until ${formatChargeDate(trialInfo.chargeDate)}`
                    : `Free access until ${formatChargeDate(trialInfo.chargeDate)}`}
                </Text>
              )}

              {needsAction && Platform.OS !== 'web' && (
                <Pressable onPress={handleRestore} disabled={restoring} className="w-full py-2 items-center mt-1">
                  <Text className="text-white/40 text-base">{restoring ? 'Restoring…' : 'Restore purchases'}</Text>
                </Pressable>
              )}

              {needsAction && Platform.OS === 'web' && (
                <View style={{ gap: 8, marginTop: 10 }}>
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
            </View>
          )}

          {/* Only for someone actually paying — a genuine subscriber gets no
              further pitch (that's what Features above is for), just a
              short, honest thank-you. Deliberately doesn't repeat feature
              claims that aren't actually exclusive to Plus. */}
          {status === 'subscribed' && (
            <View>
              <Card>
                <View className="px-4 py-4">
                  <Text className="text-white text-base font-semibold mb-2">Thanks for being an Okana Plus member 💚</Text>
                  <View className="flex-row items-start" style={{ gap: 8 }}>
                    <View style={{ marginTop: 2 }}><CheckIcon size={14} /></View>
                    <Text className="text-white/50 text-sm flex-1" style={{ lineHeight: 19 }}>
                      Unlimited transaction tracking, no interruptions.
                    </Text>
                  </View>
                  <View className="flex-row items-start mt-1" style={{ gap: 8 }}>
                    <View style={{ marginTop: 2 }}><CheckIcon size={14} /></View>
                    <Text className="text-white/50 text-sm flex-1" style={{ lineHeight: 19 }}>
                      You're supporting an independently built app, made by one person.
                    </Text>
                  </View>
                  <View className="flex-row items-start mt-1" style={{ gap: 8 }}>
                    <View style={{ marginTop: 2 }}><CheckIcon size={14} /></View>
                    <Text className="text-white/50 text-sm flex-1" style={{ lineHeight: 19 }}>
                      Helps keep Okana improving and ad-free.
                    </Text>
                  </View>

                </View>
              </Card>

              <Text className="text-white/40 text-sm text-center" style={{ marginTop: 40, marginBottom: 4 }}>
                {trialInfo.cancelAtPeriodEnd
                  ? `Access until ${formatChargeDate(trialInfo.chargeDate)}`
                  : `You'll be charged ₹${PRICE_PER_YEAR} on ${formatChargeDate(trialInfo.chargeDate)}`}
              </Text>
            </View>
          )}

          {canManage && Platform.OS !== 'web' && (
            <Pressable
              onPress={() => (isOnline ? openManageSubscription() : notifyOffline())}
              className="w-full py-[15px] rounded-2xl items-center"
              style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
            >
              <Text className="text-white text-base font-semibold">Manage Subscription</Text>
            </Pressable>
          )}
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
