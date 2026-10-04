import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, RefreshControl, Platform, ActivityIndicator, StyleSheet, AppState } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withRepeat, cancelAnimation, Easing } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { useSubscription } from '../../hooks/useSubscription';
import { usePurchases, openManageSubscription } from '../../hooks/usePurchases';
import { formatChargeDate, getSubscriptionDisplayStatus, PLUS_BENEFITS, PRICE_PER_YEAR } from '../../utils/trial';
import { today } from '../../utils/format';
import { BackIcon, CheckIcon, RefreshIcon } from '../../components/icons';
import { PaymentProcessing } from '../../components/PaymentProcessing';
import { SETTLE_EASING } from '../../utils/motion';
import { darkText } from '../../utils/colors';
import { GUTTER } from '../../utils/spacing';
import { FONT } from '../../utils/type';

// How much of the background image shows through the black.
const BACKGROUND = require('../../assets/subscription-bg.webp');
const BACKGROUND_OPACITY = 0.35;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Confirms a tap actually did something — spins for a minimum stretch (even
// if the real refresh() resolves near-instantly, same "hold it long enough
// to read as deliberate" reasoning as the avatar-upload spinner in
// account.js), then settles into a plain "Refreshed" label for a few
// seconds before quietly reverting. Icon and label never coexist — one
// fades out, then the other fades in — so there's no dual-layout trick to
// get wrong, just a sequential crossfade.
const REFRESH_MIN_SPIN_MS = 2000;
const REFRESH_HOLD_MS = 5000;
const REFRESH_FADE_MS = 280;

function RefreshAction({ onRefresh }) {
  const [phase, setPhase] = useState('icon'); // 'icon' | 'label' — which one is actually mounted right now
  const [busy, setBusy] = useState(false);
  const rotation = useSharedValue(0);
  const opacity = useSharedValue(1);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const iconStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ rotate: `${rotation.value}deg` }],
  }));
  const labelStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  async function handlePress() {
    if (busy) return;
    setBusy(true);

    rotation.value = 0;
    rotation.value = withRepeat(withTiming(360, { duration: 700, easing: Easing.linear }), -1, false);

    await Promise.all([sleep(REFRESH_MIN_SPIN_MS), onRefresh()]);
    if (!mountedRef.current) return;

    // Icon → label
    opacity.value = withTiming(0, { duration: REFRESH_FADE_MS, easing: SETTLE_EASING });
    await sleep(REFRESH_FADE_MS);
    if (!mountedRef.current) return;
    cancelAnimation(rotation);
    setPhase('label');
    opacity.value = withTiming(1, { duration: REFRESH_FADE_MS, easing: SETTLE_EASING });

    await sleep(REFRESH_HOLD_MS);
    if (!mountedRef.current) return;

    // Label → icon
    opacity.value = withTiming(0, { duration: REFRESH_FADE_MS, easing: SETTLE_EASING });
    await sleep(REFRESH_FADE_MS);
    if (!mountedRef.current) return;
    rotation.value = 0;
    setPhase('icon');
    opacity.value = withTiming(1, { duration: REFRESH_FADE_MS, easing: SETTLE_EASING });

    setBusy(false);
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={busy}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={phase === 'label' ? 'Refreshed' : 'Refresh subscription status'}
    >
      {phase === 'icon' ? (
        <Animated.View style={iconStyle}>
          <RefreshIcon size={13} />
        </Animated.View>
      ) : (
        <Animated.Text
          style={[labelStyle, { fontSize: FONT.label, fontWeight: '500', color: 'rgba(74,222,128,0.9)' }]}
        >
          Refreshed
        </Animated.Text>
      )}
    </Pressable>
  );
}

// The one plan, as a quiet one-line card: the yearly price.
function PriceLine({ price, suffix }) {
  return (
    <View style={{ borderWidth: 1, borderColor: '#2a2a2a', backgroundColor: '#161616', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 16 }}>
      <Text style={{ fontSize: FONT.body, color: '#ffffff', textAlign: 'center' }}>
        {price} a year
        {!!suffix && <Text style={{ color: darkText.tertiary }}>{` ${suffix}`}</Text>}
      </Text>
    </View>
  );
}

export default function SubscriptionPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { isOnline, notifyOffline } = useNetwork();
  const { subscription, loading, refresh } = useSubscription(user);
  const { getOfferings, purchasePackage, restorePurchases } = usePurchases(user?.id);

  // useSubscription only fetches once on this screen's own mount — returning
  // here after cancelling via "Manage Subscription" (a native OS sheet, not
  // an in-app screen, so this component never unmounts) otherwise left this
  // page showing stale pre-cancellation state, e.g. still promising "You'll
  // be charged ₹499 on [date]" for a subscription that was just cancelled.
  // Same fix account.js already applies to its own "Current Plan" pill for
  // the identical reason — refetching on every focus keeps it current the
  // moment you actually land back here.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  // Belt to useFocusEffect's suspenders: showManageSubscriptions() presents
  // a native OS sheet, not an in-app screen, and it's not guaranteed to
  // register as a React Navigation blur/focus transition the same way
  // moving between app screens does — so the moment that actually reliably
  // fires either way is the app itself coming back to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

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
    setPurchaseNotice(null);
    const result = await restorePurchases();
    if (!result.success) {
      setPurchaseError(result.error || 'Could not restore purchases.');
      setRestoring(false);
      return;
    }

    // Same reasoning as handleSubscribe above — restorePurchases() only
    // confirms RevenueCat re-validated the receipt, not that our own
    // webhook has landed and written the row yet. A single immediate
    // refresh() here would often just show stale "not subscribed" state
    // for a restore that genuinely succeeded.
    let confirmed = false;
    for (let i = 0; i < 15; i++) {
      const data = await refresh();
      if (['trial', 'subscribed'].includes(getSubscriptionDisplayStatus(data, today()).status)) {
        confirmed = true;
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    if (!confirmed) {
      // Not trusted for granting access (that's still DB-only, above) — only
      // used here to pick an honest message. An empty active-entitlements
      // map means there's genuinely nothing on this Apple/Google account to
      // restore, not that our webhook is merely running behind.
      const hasActiveEntitlement = Object.keys(result.customerInfo?.entitlements?.active || {}).length > 0;
      // "Just finishing up" isn't a failure, so it's the grey notice; only a
      // genuine "nothing to restore" is the red error.
      if (hasActiveEntitlement) setPurchaseNotice("Restored — just finishing up. This can take a minute; pull to refresh if it doesn't update.");
      else setPurchaseError('No previous purchases found on this account.');
    }
    setRestoring(false);
  }

  const insets = useSafeAreaInsets();
  // The store formats this itself, and some locales put a space (or a
  // non-breaking one) between the symbol and the number — "₹ 499".
  const price = (pkg?.product?.priceString || `₹${PRICE_PER_YEAR}`).replace(/\s+/g, '');
  const storeName = Platform.OS === 'ios' ? 'the App Store' : 'Play Store';
  const daysLeft = trialInfo.chargeDate ? Math.max(0, differenceInCalendarDays(parseISO(trialInfo.chargeDate), parseISO(today()))) : 0;
  const chargeDate = trialInfo.chargeDate ? formatChargeDate(trialInfo.chargeDate) : '';

  // The heading: what state this account is in, in a line.
  let kicker;
  let title;
  let sub = null;
  if (status === 'trial') {
    kicker = 'Free trial';
    title = daysLeft === 1 ? '1 day left' : `${daysLeft} days left`;
  } else if (status === 'expired') {
    kicker = 'Your trial has ended';
    title = 'Pick up where you left off.';
  } else if (status === 'subscribed') {
    kicker = 'Okana Plus';
    title = "You're all set";
    sub = trialInfo.cancelAtPeriodEnd ? `Access until ${chargeDate}` : `Renews ${chargeDate} · ${price}`;
  } else {
    kicker = 'Okana Plus';
    title = 'Upgrade to Okana Plus and keep tracking.';
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      {/* A soft grey texture, held right down so the page still reads as black. */}
      <Image
        source={BACKGROUND}
        contentFit="cover"
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { opacity: BACKGROUND_OPACITY }]}
      />
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="rgba(255,255,255,0.6)" />
        }
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: GUTTER, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center justify-between">
          <Pressable
            // Same canGoBack() guard as account.js's back button, and for the
            // same reason — a reload/deep-link landing directly here would
            // otherwise leave back() silently doing nothing.
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(app)'))}
            className="w-9 h-9 items-center justify-center rounded-xl"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <BackIcon />
          </Pressable>
          {needsAction && Platform.OS !== 'web' && (
            <Pressable onPress={handleRestore} disabled={restoring} hitSlop={8} accessibilityRole="button">
              <Text style={{ fontSize: FONT.caption, color: darkText.tertiary, opacity: restoring ? 0.5 : 1 }}>Restore</Text>
            </Pressable>
          )}
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
          <>
            <View className="items-center" style={{ marginTop: 40 }}>
              <View className="flex-row items-center" style={{ gap: 10 }}>
                <Text style={{ fontSize: FONT.caption, color: darkText.tertiary }}>{kicker}</Text>
                {/* Only in the window where it matters: the trial is over (or never
                    started) and there's no subscription yet. That's when a
                    purchase or a restore can land a moment before this page
                    knows, and pull-to-refresh isn't discoverable. Calls
                    refresh() directly, not onRefresh — the latter also flips on
                    the ScrollView's native pull-to-refresh spinner. */}
                {needsAction && <RefreshAction onRefresh={refresh} />}
              </View>
              <Text style={{ fontSize: FONT.title, fontWeight: '300', lineHeight: 27, letterSpacing: -0.3, color: '#ffffff', textAlign: 'center', marginTop: 8 }}>
                {title}
              </Text>
              {!!sub && <Text style={{ fontSize: FONT.caption, color: darkText.tertiary, marginTop: 8, textAlign: 'center' }}>{sub}</Text>}
              {status === 'subscribed' && trialInfo.paymentFailed && (
                <Text style={{ fontSize: FONT.caption, color: 'rgba(248,113,113,0.85)', marginTop: 10, textAlign: 'center' }}>
                  There's a problem with your payment — update it in {storeName} to keep your access.
                </Text>
              )}
            </View>

            {/* The benefits list, on every state of this page. */}
            <View style={{ marginTop: 36, paddingHorizontal: 6 }}>
              {PLUS_BENEFITS.map((line) => (
                <View key={line} className="flex-row items-center" style={{ gap: 14, paddingVertical: 11 }}>
                  <CheckIcon size={16} />
                  <Text style={{ fontSize: FONT.body, color: 'rgba(255,255,255,0.85)' }}>{line}</Text>
                </View>
              ))}
            </View>

            <View style={{ height: 32 }} />

            {status === 'trial' && (
              <PriceLine price={price} suffix="after your trial" />
            )}

            {needsAction && Platform.OS !== 'web' && (
              <View style={{ gap: 10 }}>
                {!!purchaseError && (
                  <View className="rounded-xl px-4 py-3" style={{ backgroundColor: 'rgba(248,113,113,0.08)', borderWidth: 1, borderColor: 'rgba(248,113,113,0.2)' }}>
                    <Text style={{ fontSize: FONT.caption, color: '#fca5a5' }}>{purchaseError}</Text>
                  </View>
                )}
                {!!purchaseNotice && (
                  <View className="rounded-xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
                    <Text style={{ fontSize: FONT.caption, color: 'rgba(255,255,255,0.6)' }}>{purchaseNotice}</Text>
                  </View>
                )}
                {offeringLoading ? (
                  <View className="w-full rounded-full items-center" style={{ backgroundColor: 'rgba(255,255,255,0.08)', paddingVertical: 15 }}>
                    <ActivityIndicator color="rgba(255,255,255,0.5)" />
                  </View>
                ) : pkg ? (
                  <Pressable
                    onPress={handleSubscribe}
                    disabled={purchasing}
                    accessibilityRole="button"
                    className="w-full rounded-full items-center"
                    style={{ backgroundColor: '#ffffff', paddingVertical: 15, opacity: purchasing ? 0.6 : 1 }}
                  >
                    <Text style={{ fontSize: FONT.body, fontWeight: '500', color: '#000000' }}>{`Subscribe now ${price}/year`}</Text>
                  </Pressable>
                ) : (
                  <View className="w-full rounded-full items-center" style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingVertical: 15 }}>
                    <Text style={{ fontSize: FONT.body, color: darkText.tertiary }}>
                      {offeringError || 'Subscription options unavailable'}
                    </Text>
                  </View>
                )}
                <Text style={{ fontSize: FONT.caption, color: darkText.tertiary, textAlign: 'center' }}>
                  {status === 'expired' ? 'Your data is safe and waiting.' : 'Cancel anytime.'}
                </Text>
              </View>
            )}

            {needsAction && Platform.OS === 'web' && (
              <View style={{ gap: 8 }}>
                <PriceLine price={price} />
                <View className="w-full rounded-full items-center" style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingVertical: 15 }}>
                  <Text style={{ fontSize: FONT.body, color: darkText.tertiary }}>Not available on web</Text>
                </View>
                <Text className="text-center" style={{ fontSize: FONT.caption, color: darkText.tertiary }}>
                  Subscribing is only available from the iOS or Android app.
                </Text>
              </View>
            )}

            {status === 'subscribed' && (
              <View style={{ gap: 12 }}>
                {canManage && Platform.OS !== 'web' && (
                  <Pressable
                    onPress={() => (isOnline ? openManageSubscription() : notifyOffline())}
                    accessibilityRole="button"
                    className="w-full rounded-full items-center"
                    style={{ backgroundColor: 'rgba(255,255,255,0.08)', paddingVertical: 15 }}
                  >
                    <Text style={{ fontSize: FONT.body, fontWeight: '500', color: '#ffffff' }}>Manage subscription</Text>
                  </Pressable>
                )}
              </View>
            )}
          </>
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
