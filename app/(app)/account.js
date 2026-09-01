import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Platform, Linking, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import Svg, { Circle, Rect, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, useAnimatedProps, withDelay, withSequence, withTiming, Easing } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { isConnectivityError } from '../../utils/errors';
import { useSubscription } from '../../hooks/useSubscription';
import { useTransactions } from '../../hooks/useTransactions';
import { openManageSubscription } from '../../hooks/usePurchases';
import { getSubscriptionDisplayStatus } from '../../utils/trial';
import { today } from '../../utils/format';
import { supabase } from '../../lib/supabase';
import { buildTransactionsWorkbook, parseTransactionsWorkbook } from '../../utils/exportImport';
import { BackIcon, EditIcon, ChevronRight, CheckIcon, CameraIcon } from '../../components/icons';
import { ONBOARDING_SEEN_KEY } from '../onboarding';
import { AnimatedModal } from '../../components/AnimatedModal';
import { ActionOverlay } from '../../components/ActionOverlay';

const SETTLE_EASING = Easing.bezier(0.16, 1, 0.3, 1);
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
// Reads the real version from app.json (via Expo's config, not a second
// hardcoded copy that silently drifts from the real one — it already had,
// showing 1.0.0 while the actual shipped version was 1.0.2).
const APP_VERSION = Constants.expoConfig?.version ?? '—';

function InstagramIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Rect x="2" y="2" width="20" height="20" rx="6" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
      <Circle cx="12" cy="12" r="4" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
      <Circle cx="17.5" cy="6.5" r="1" fill="rgba(255,255,255,0.5)" />
    </Svg>
  );
}

function YouTubeIcon() {
  return (
    <Svg width={16} height={14} viewBox="0 0 24 17" fill="none">
      <Rect x="0.5" y="0.5" width="23" height="16" rx="4" stroke="rgba(255,255,255,0.5)" strokeWidth="1.3" />
      <Path d="M10 5.5l6 3-6 3v-6z" fill="rgba(255,255,255,0.5)" />
    </Svg>
  );
}

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

function Pill({ label, tone = 'green' }) {
  const color = tone === 'red' ? '#f87171' : '#4ade80';
  const bg = tone === 'red' ? 'rgba(248,113,113,0.14)' : 'rgba(74,222,128,0.14)';
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 }}>
      <Text style={{ color, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

function Row({ label, value, onPress, right }) {
  const content = (
    <View className="flex-row items-center justify-between px-4 py-[14px]">
      <Text className="text-white text-base">{label}</Text>
      <View className="flex-row items-center" style={{ gap: 8 }}>
        {!!value && <Text className="text-white/35 text-xs">{value}</Text>}
        {right || (onPress && !right && <ChevronRight />)}
      </View>
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{content}</Pressable> : content;
}

function InfoModal({ open, title, onClose, onClosed, children }) {
  const { height: windowHeight } = useWindowDimensions();
  return (
    <AnimatedModal open={open} onClose={onClose} onClosed={onClosed} variant="bottom">
      <View
        className="px-6 pt-5 pb-10"
        style={{ maxHeight: windowHeight * 0.8, backgroundColor: 'rgba(14,14,14,0.97)', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}
      >
        <View className="w-8 h-1 rounded-full mx-auto mb-5" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }} />
        <Text className="text-white font-semibold text-base mb-4">{title}</Text>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </View>
    </AnimatedModal>
  );
}

function minDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// How long the green checkmark stays fully visible before crossfading into
// the (by then already-updated) photo, and how long that crossfade itself
// takes. Shared with the parent's own timer that resets the phase back to
// 'idle' once the whole sequence has actually finished playing.
const AVATAR_CHECK_POP_MS = 220;
const AVATAR_CHECK_HOLD_MS = 900;
const AVATAR_CROSSFADE_MS = 350;
const AVATAR_SEQUENCE_MS = AVATAR_CHECK_POP_MS + AVATAR_CHECK_HOLD_MS + AVATAR_CROSSFADE_MS;

const RING_SIZE = 86;
const RING_STROKE = 3;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
// How long the ring takes to sweep from 0% to a full circle — the parent's
// own minimum-upload-duration timer runs slightly longer than this, so the
// ring always finishes its sweep before the phase flips to 'success' and
// the check appears, instead of the two racing each other.
const RING_FILL_MS = 4000;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// 'idle' | 'uploading' | 'success'. While uploading, a green ring sweeps
// from empty to a full circle over RING_FILL_MS — a real 0%→100% progress
// indicator, not a spinner — around the (still-old) photo. Once it
// completes, the ring fades as a green check pops in — on a soft
// green-tinted badge (matching the same success-circle treatment used
// elsewhere in the app) plus a brief outward glow, rather than a flat dark
// disc — fully covering the photo, then holds and fades away to reveal
// what's underneath. Because the parent has already updated `uri` to the
// new photo by the time 'success' fires, what gets revealed is the new
// photo, reading as it "fading in" even though the image itself never
// moved — the check disappearing is what does the work.
function AvatarPhoto({ uri, phase, onPress }) {
  const ringOpacity = useSharedValue(0);
  const ringProgress = useSharedValue(0); // 0 → 1
  const checkOpacity = useSharedValue(0);
  const checkScale = useSharedValue(0.6);
  const glowScale = useSharedValue(0.6);
  const glowOpacity = useSharedValue(0);

  useEffect(() => {
    if (phase === 'uploading') {
      ringOpacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
      ringProgress.value = 0;
      ringProgress.value = withTiming(1, { duration: RING_FILL_MS, easing: Easing.out(Easing.cubic) });
      checkOpacity.value = 0;
      checkScale.value = 0.6;
      glowOpacity.value = 0;
    } else if (phase === 'success') {
      ringOpacity.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
      // The backdrop itself snaps to fully opaque essentially instantly —
      // any fade-in here would leave a brief window where it's still
      // partly see-through, letting the (already-updated) photo peek
      // through before the check has properly "arrived". checkScale below
      // still gives it a bouncy pop-in on top of an already-solid backdrop,
      // so the reveal order stays tick-first, photo-after.
      checkOpacity.value = withSequence(
        withTiming(1, { duration: 1 }),
        withDelay(AVATAR_CHECK_HOLD_MS, withTiming(0, { duration: AVATAR_CROSSFADE_MS, easing: Easing.out(Easing.cubic) })),
      );
      checkScale.value = withSequence(
        withTiming(1.15, { duration: 300, easing: Easing.out(Easing.back(1.4)) }),
        withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }),
      );
      // Outward glow "burst" timed with the check's pop — expands and fades
      // once, the satisfying flourish a flat reveal was missing.
      glowScale.value = 0.6;
      glowScale.value = withTiming(1.6, { duration: 550, easing: Easing.out(Easing.cubic) });
      glowOpacity.value = withSequence(
        withTiming(0.5, { duration: 160, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 420, easing: Easing.out(Easing.cubic) }),
      );
    } else {
      ringOpacity.value = 0;
      checkOpacity.value = 0;
      glowOpacity.value = 0;
    }
  }, [phase, ringOpacity, ringProgress, checkOpacity, checkScale, glowScale, glowOpacity]);

  const ringContainerStyle = useAnimatedStyle(() => ({ opacity: ringOpacity.value }));
  // Starts empty (full circumference as the offset, so nothing is drawn) and
  // sweeps down to 0 (fully drawn) — the standard SVG circular-progress
  // technique. A static -90deg rotation on the container (below) makes the
  // sweep start from the top instead of the default 3-o'clock position.
  const ringAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_CIRCUMFERENCE * (1 - ringProgress.value),
  }));
  const checkStyle = useAnimatedStyle(() => ({
    opacity: checkOpacity.value,
    transform: [{ scale: checkScale.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: glowScale.value }],
  }));

  return (
    <Pressable onPress={onPress} disabled={phase === 'uploading'} style={{ width: 80, height: 80 }}>
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: 80, height: 80, borderRadius: 40, borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)' }}
          cachePolicy="memory-disk"
          transition={150}
        />
      ) : (
        <View
          className="w-20 h-20 rounded-full items-center justify-center"
          style={{ backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)' }}
        >
          <CameraIcon size={28} />
        </View>
      )}

      {/* Progress ring — sweeps 0%→100% while uploading, gone by the time the check pops in */}
      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', top: -3, left: -3, width: RING_SIZE, height: RING_SIZE, transform: [{ rotate: '-90deg' }] },
          ringContainerStyle,
        ]}
      >
        <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
          <AnimatedCircle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            stroke="#4ade80"
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            animatedProps={ringAnimatedProps}
            fill="none"
          />
        </Svg>
      </Animated.View>

      {/* Success glow — a soft ring that briefly expands outward and fades,
          timed with the check's own pop-in. */}
      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', top: -3, left: -3, right: -3, bottom: -3, borderRadius: 43, backgroundColor: 'rgba(74,222,128,0.35)' },
          glowStyle,
        ]}
      />

      {/* Success check — soft green-tinted badge (matching the success
          treatment used elsewhere in the app) fully covers the photo while
          visible, so fading it out reads as the photo fading in rather than
          an icon just sitting flat on top of an already-visible photo. */}
      <Animated.View
        pointerEvents="none"
        className="items-center justify-center"
        style={[
          { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 40, backgroundColor: 'rgba(74,222,128,0.16)', borderWidth: 1.5, borderColor: 'rgba(74,222,128,0.4)' },
          checkStyle,
        ]}
      >
        <CheckIcon size={32} />
      </Animated.View>
    </Pressable>
  );
}

// tone 'danger' (default) is for irreversible actions (erase/delete);
// 'neutral' is for a reversible one (logout) that still deserves a
// confirm tap but shouldn't visually read as equally dangerous.
function ConfirmModal({ open, title, message, confirmLabel, tone = 'danger', onConfirm, onCancel, onClosed }) {
  const confirmBg = tone === 'danger' ? 'rgba(248,113,113,0.14)' : 'rgba(255,255,255,0.1)';
  const confirmColor = tone === 'danger' ? 'rgba(248,113,113,0.9)' : '#ffffff';
  return (
    <AnimatedModal open={open} onClose={onCancel} onClosed={onClosed} variant="center">
      <View
        className="w-full rounded-2xl p-6"
        style={{ maxWidth: 360, backgroundColor: 'rgba(20,20,20,0.98)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }}
      >
        <Text className="text-white font-semibold text-base mb-2">{title}</Text>
        <Text className="text-white/45 text-base mb-6" style={{ lineHeight: 22 }}>{message}</Text>
        <View className="flex-row" style={{ gap: 12 }}>
          <Pressable onPress={onCancel} className="flex-1 py-3 rounded-xl items-center" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
            <Text className="text-white/60 text-base font-medium">Cancel</Text>
          </Pressable>
          <Pressable onPress={onConfirm} className="flex-1 py-3 rounded-xl items-center" style={{ backgroundColor: confirmBg }}>
            <Text className="text-base font-semibold" style={{ color: confirmColor }}>{confirmLabel}</Text>
          </Pressable>
        </View>
      </View>
    </AnimatedModal>
  );
}

const SUCCESS_HOLD_MS = 3000;
// Longer hold specifically for a delete that leaves an active native
// subscription behind — long enough to actually read the warning and tap
// through to the App/Play Store before this auto-advances to logout.
const SUBSCRIPTION_WARNING_HOLD_MS = 10000;

const ACTION_COPY = {
  erase:  { working: 'Erasing your data',     success: 'Data erased' },
  delete: { working: 'Deleting your account', success: 'Account deleted' },
};

// `subscriptionWarning` (delete only) shows a reminder + deep link to the
// store, since deleting the account never cancels an active native
// subscription — see runDelete's comment for why that's not possible here.
function DeleteAccountOverlay({ type, phase, onDone, subscriptionWarning }) {
  const { isOnline, notifyOffline } = useNetwork();
  const copy = ACTION_COPY[type];
  return (
    <ActionOverlay
      phase={phase}
      workingText={copy.working}
      successText={copy.success}
      holdMs={subscriptionWarning ? SUBSCRIPTION_WARNING_HOLD_MS : SUCCESS_HOLD_MS}
      onDone={onDone}
    >
      {subscriptionWarning && (
        <>
          <Text className="text-white/45 text-sm text-center mt-3" style={{ lineHeight: 19 }}>
            Your {Platform.OS === 'ios' ? 'App Store' : 'Play Store'} subscription is still active — cancel it to stop future charges.
          </Text>
          <Pressable
            onPress={() => (isOnline ? openManageSubscription() : notifyOffline())}
            className="mt-4 px-4 py-[10px] rounded-xl"
            style={{ backgroundColor: 'rgba(74,222,128,0.14)' }}
          >
            <Text className="text-sm font-semibold" style={{ color: '#4ade80' }}>Manage Subscription</Text>
          </Pressable>
        </>
      )}
    </ActionOverlay>
  );
}

// Fixed toast anchored above the tab bar, matching OfflineBanner's
// fade+slide treatment but from the bottom — used for brief, non-blocking
// feedback (e.g. "nothing to export yet") that doesn't need a modal.
function BottomBanner({ visible, children }) {
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, { duration: 220, easing: Easing.out(Easing.quad) });
  }, [visible]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 16 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: insets.bottom + 20,
          alignItems: 'center',
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderRadius: 14,
          backgroundColor: '#1c1c1c',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.08)',
        },
        style,
      ]}
    >
      <Text className="text-white/80 text-sm font-medium text-center">{children}</Text>
    </Animated.View>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const { user, profile, logout } = useAuth();
  const { isOnline, isOnlineRef, notifyOffline } = useNetwork();
  const { subscription, refresh: refreshSubscription } = useSubscription(user);
  const { transactions, importTransactions } = useTransactions();

  // Settings stays mounted underneath Subscription when you navigate there
  // (standard stack behavior) — useSubscription only fetches once on this
  // screen's own mount, so completing a purchase on Subscription and coming
  // back here left this "Current Plan" pill stuck on whatever it was before
  // the purchase until something else happened to remount this screen.
  // Refetching on every focus, same as Dashboard already does for the same
  // reason, means it's current the moment you actually land back here.
  useFocusEffect(
    useCallback(() => {
      refreshSubscription();
    }, [refreshSubscription])
  );

  const trialInfo = subscription ? getSubscriptionDisplayStatus(subscription, today()) : { status: 'not_started' };
  const status = trialInfo.status;
  const hasActivePlus = status === 'trial' || status === 'subscribed';
  const isEnding = trialInfo.cancelAtPeriodEnd && hasActivePlus;
  // 'trial' is a billing-mechanics detail, not something shown to the user —
  // Plus covers it the same as a fully paid subscription.
  const planLabel = status === 'expired' ? 'Expired' : isEnding ? 'Ending' : hasActivePlus ? 'Plus' : 'Free';
  // Only an actual purchase leaves a real store subscription to warn
  // about — the app-granted trial has none, so warning a trial user to
  // "cancel in the App/Play Store" would point them at a subscription that
  // doesn't exist.
  const hasRealSubscription = status === 'subscribed';
  const planTone = status === 'expired' ? 'red' : 'green';

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(profile?.name || '');
  const [savingName, setSavingName] = useState(false);
  const [avatarPhase, setAvatarPhase] = useState('idle'); // 'idle' | 'uploading' | 'success'

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showEraseConfirm, setShowEraseConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // { type: 'erase' | 'delete', phase: 'working' | 'success' } | null — one
  // flow at a time, since only one of Erase/Delete can be in progress.
  const [actionFlow, setActionFlow] = useState(null);
  const [actionError, setActionError] = useState('');

  const [modal, setModal] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [noTransactionsBanner, setNoTransactionsBanner] = useState(false);
  const noTransactionsBannerTimeoutRef = useRef(null);

  const showNoTransactionsBanner = useCallback(() => {
    if (noTransactionsBannerTimeoutRef.current) clearTimeout(noTransactionsBannerTimeoutRef.current);
    setNoTransactionsBanner(true);
    noTransactionsBannerTimeoutRef.current = setTimeout(() => setNoTransactionsBanner(false), 2000);
  }, []);

  useEffect(() => {
    return () => { if (noTransactionsBannerTimeoutRef.current) clearTimeout(noTransactionsBannerTimeoutRef.current); };
  }, []);

  const [importOptionsOpen, setImportOptionsOpen] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  // idle | reading | importing | done | error
  const [importStage, setImportStage] = useState('idle');
  const [importMessage, setImportMessage] = useState('');
  const [importErrorMsg, setImportErrorMsg] = useState('');
  // True when the failure happened before any real import attempt — an
  // unreadable file or a template that doesn't match the expected columns
  // — as opposed to a genuine network/server error partway through
  // importing. Only this case offers "Download Template" as a way out.
  const [importFormatError, setImportFormatError] = useState(false);
  const importProgress = useSharedValue(0);
  const progressBarStyle = useAnimatedStyle(() => ({ width: `${importProgress.value * 100}%` }));

  // Cleared on unmount so a completed import's delayed redirect can't fire
  // after the user has already navigated elsewhere (e.g. tapped back right
  // after seeing "Imported N transactions") and force them back to Home.
  const importRedirectTimeoutRef = useRef(null);
  useEffect(() => () => {
    if (importRedirectTimeoutRef.current) clearTimeout(importRedirectTimeoutRef.current);
  }, []);

  // Opening ActionOverlay before its ConfirmModal has actually finished
  // closing means two native <Modal>s mounted at once — broken on Android
  // (same issue fixed on the Dashboard's calendar/budget/recap flow). Stash
  // which action to run and let ConfirmModal's onClosed — fired only once
  // it's truly gone — trigger it.
  const pendingAfterConfirmClose = useRef(null); // 'erase' | 'delete' | null

  // Same reasoning as pendingAfterConfirmClose above — Import Data's options
  // sheet is this same InfoModal/AnimatedModal (a native <Modal>), and both
  // its actions open ANOTHER native surface (the document picker, or the
  // share sheet for the template download). Firing those the instant the
  // button is tapped means the sheet is still mid-close when the next
  // native surface tries to present, which is exactly the "two native
  // Modals at once" state that hangs the app — not a metaphorical bug, an
  // actually-broken screen. Stash which action to run and let
  // InfoModal's onClosed (fired only once it's truly gone) trigger it.
  const pendingAfterImportOptionsClose = useRef(null); // 'file' | 'template' | null

  async function saveName() {
    // Belt-and-suspenders alongside the Save button's own `disabled` prop —
    // see login.js's handleSubmit for why: onSubmitEditing and a button tap
    // can both fire this before React's state update re-renders the button.
    if (savingName) return;
    if (!nameInput.trim() || nameInput.trim() === profile?.name) { setEditingName(false); return; }
    if (!isOnline) { notifyOffline(); return; }
    setSavingName(true);
    setActionError('');
    try {
      const { error } = await supabase.auth.updateUser({ data: { name: nameInput.trim() } });
      if (error) throw error;
      setEditingName(false);
    } catch (err) {
      if (isConnectivityError(err, isOnline)) { notifyOffline(); }
      else { setActionError(err.message || 'Failed to update name. Please try again.'); }
    } finally {
      setSavingName(false);
    }
  }

  async function pickAndUploadAvatar() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setActionError('Photo library access is needed to set a profile photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;

    if (!isOnline) { notifyOffline(); return; }

    setAvatarPhase('uploading');
    setActionError('');
    try {
      const asset = result.assets[0];
      // Held to a minimum so the spinning status ring always gets to
      // actually play instead of flashing to success when the upload
      // happens to finish in well under a second.
      await Promise.all([minDelay(4500), (async () => {
        // Always the same path — the storage policy only allows UPDATE (via
        // upsert) on a path already under this user's own folder, and
        // there's no DELETE policy, so a fixed filename is what keeps
        // re-uploads from just piling up as orphaned objects.
        const path = `${user.id}/avatar.jpg`;
        const contentType = asset.mimeType || 'image/jpeg';

        const response = await fetch(asset.uri);
        const arrayBuffer = await response.arrayBuffer();

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(path, arrayBuffer, { contentType, upsert: true });
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
        // Cache-bust — the bucket is public and the path never changes, so
        // without this the CDN/RN's own image cache would keep serving the
        // previous photo after a re-upload.
        const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

        const { error: updateError } = await supabase.auth.updateUser({ data: { avatar_url: avatarUrl } });
        if (updateError) throw updateError;
      })()]);
      // `profile.avatar` (from AuthContext) is already the new URL by the
      // time this fires — the check-fade-out below is what reveals it.
      setAvatarPhase('success');
      setTimeout(() => setAvatarPhase('idle'), AVATAR_SEQUENCE_MS);
    } catch (err) {
      setAvatarPhase('idle');
      if (isConnectivityError(err, isOnline)) { notifyOffline(); }
      else { setActionError(err.message || 'Failed to update profile photo. Please try again.'); }
    }
  }

  function confirmErase() {
    pendingAfterConfirmClose.current = 'erase';
    setShowEraseConfirm(false);
  }

  function confirmDelete() {
    pendingAfterConfirmClose.current = 'delete';
    setShowDeleteConfirm(false);
  }

  async function runErase() {
    if (!isOnline) { notifyOffline(); return; }
    setActionError('');
    setActionFlow({ type: 'erase', phase: 'working' });
    // Tracks how far the sequence got — these are separate DB calls, not
    // one atomic transaction, so a failure partway through has already
    // deleted whatever came before it. The error message says so instead
    // of implying nothing happened.
    let step = 'transactions';
    try {
      // Held to a 4s minimum so the progress bar always has time to visibly
      // fill instead of flashing straight to success when the deletes
      // happen to finish almost instantly.
      await Promise.all([minDelay(4000), (async () => {
        const { error: txError } = await supabase.from('transactions').delete().eq('user_id', user.id);
        if (txError) throw txError;
        step = 'budget';
        const { error: budgetError } = await supabase.from('monthly_budgets').delete().eq('user_id', user.id);
        if (budgetError) throw budgetError;
        // Lets the budget-setup popup fire again on the next Dashboard visit —
        // otherwise the "already shown this month" flag would keep suppressing
        // it even though there's no budget anymore.
        await AsyncStorage.removeItem(`okana_budget_setup_shown_${user.id}`);
      })()]);
      setActionFlow({ type: 'erase', phase: 'success' });
    } catch (err) {
      setActionFlow(null);
      if (isConnectivityError(err, isOnline)) { notifyOffline(); return; }
      setActionError(
        step === 'budget'
          ? `Your transactions were erased, but budgets couldn't be — ${err.message || 'please try again'}.`
          : err.message || 'Something went wrong. Please try again.'
      );
    }
  }

  async function runDelete() {
    if (!isOnline) { notifyOffline(); return; }
    setActionError('');
    setActionFlow({ type: 'delete', phase: 'working' });
    // Nothing to cancel via API here — neither the App Store nor Play Store
    // lets an app cancel a subscription on the user's behalf, only the user
    // can do that on-device. The delete confirmation warns them of this
    // upfront (see the ConfirmModal below) rather than pretending this flow
    // can do it for them.
    let step = 'transactions';
    try {
      await Promise.all([minDelay(4000), (async () => {
        const { error: txError } = await supabase.from('transactions').delete().eq('user_id', user.id);
        if (txError) throw txError;
        // monthly_budgets has a (no-cascade) FK to auth.users — must be cleared
        // before delete_user() or the account delete itself fails.
        step = 'budget';
        const { error: budgetError } = await supabase.from('monthly_budgets').delete().eq('user_id', user.id);
        if (budgetError) throw budgetError;
        step = 'account';
        const { error: rpcError } = await supabase.rpc('delete_user');
        if (rpcError) throw rpcError;
      })()]);
      setActionFlow({ type: 'delete', phase: 'success' });
    } catch (err) {
      setActionFlow(null);
      if (isConnectivityError(err, isOnline)) { notifyOffline(); return; }
      const partial = step === 'budget' || step === 'account';
      setActionError(
        partial
          ? `Your transactions were deleted, but your account couldn't be fully removed — ${err.message || 'please try again'}.`
          : err.message || 'Something went wrong. Please try again.'
      );
    }
  }

  const handleEraseConfirmClosed = useCallback(() => {
    if (pendingAfterConfirmClose.current !== 'erase') return;
    pendingAfterConfirmClose.current = null;
    runErase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDeleteConfirmClosed = useCallback(() => {
    if (pendingAfterConfirmClose.current !== 'delete') return;
    pendingAfterConfirmClose.current = null;
    runDelete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleImportOptionsClosed = useCallback(async () => {
    const pending = pendingAfterImportOptionsClose.current;
    pendingAfterImportOptionsClose.current = null;
    if (pending !== 'file' && pending !== 'template') return;
    // `onClosed` fires the instant React flips `visible` to false, but on
    // iOS the native <Modal>'s own dismissal can still be finishing its
    // teardown a beat later — presenting DocumentPicker/Sharing's native
    // sheet right on top of that lands the exact "two native surfaces at
    // once" collision this whole onClosed dance exists to avoid (matches
    // the 320ms stagger used the same way in index.js and elsewhere here).
    await new Promise(r => setTimeout(r, 320));
    if (pending === 'file') pickImportFile();
    else downloadTemplate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEraseDone = useCallback(() => {
    setActionFlow(null);
    router.back();
  }, [router]);

  const handleDeleteDone = useCallback(async () => {
    setActionFlow(null);
    // Deleting the account is one of the three conditions (fresh install,
    // reinstall, account deletion) that brings the first-run onboarding
    // animation back — clearing the flag first, then routing there.
    await AsyncStorage.removeItem(ONBOARDING_SEEN_KEY);
    // Navigate away from the (app) stack BEFORE signing out — app/(app)/_layout.js
    // has its own `if (!user) redirect to /login` guard, and it's still mounted
    // here. Calling logout() first flips `user` to null while that guard is
    // still active, so its redirect to /login fires and wins the race against
    // this one, dropping the onboarding navigation entirely. Leaving the stack
    // first means the guard is unmounted by the time logout() takes effect.
    router.replace('/onboarding');
    try {
      await logout();
    } catch {
      // The account (and its server-side session) is already gone via
      // delete_user() above — a failed local sign-out just means the
      // device's cached tokens outlive it, which AuthContext's own
      // getSession()/onAuthStateChange handle safely regardless.
    }
  }, [router, logout]);

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // Sign-out failing (e.g. offline) shouldn't trap the user on this
      // page with no way forward — still navigate away.
    }
    router.replace('/(auth)/login');
  }

  function closeFeedbackModal() {
    setModal(null);
    setFeedbackText('');
    setFeedbackError('');
  }

  async function sendFeedback() {
    if (!feedbackText.trim()) return;
    if (!isOnline) { notifyOffline(); return; }
    setFeedbackSending(true);
    setFeedbackError('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error('Not signed in');
      const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/send-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: feedbackText.trim() }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to send feedback');
      setFeedbackSent(true);
      setTimeout(() => { setFeedbackSent(false); setFeedbackText(''); setModal(null); }, 1500);
    } catch (err) {
      if (isConnectivityError(err, isOnlineRef.current)) { notifyOffline(); }
      else { setFeedbackError(err.message || 'Failed to send feedback. Please try again.'); }
    } finally {
      setFeedbackSending(false);
    }
  }

  async function exportData() {
    if (exporting) return;
    if (!transactions.length) {
      showNoTransactionsBanner();
      return;
    }
    setExporting(true);
    setExportError('');
    try {
      const base64 = buildTransactionsWorkbook(transactions);
      const fileUri = `${FileSystem.cacheDirectory}okana-transactions-${new Date().toISOString().slice(0, 10)}.xlsx`;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: XLSX_MIME, dialogTitle: 'Export transactions' });
      } else {
        setExportError('Sharing is not available on this device.');
      }
    } catch (err) {
      setExportError(err.message || 'Failed to export. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  // Empty version of the same workbook exportData produces — just the
  // header row, so a user unsure of the expected columns can grab a file
  // already in the right shape instead of guessing.
  async function downloadTemplate() {
    if (downloadingTemplate) return;
    setDownloadingTemplate(true);
    try {
      const base64 = buildTransactionsWorkbook([]);
      const fileUri = `${FileSystem.cacheDirectory}okana-import-template.xlsx`;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: XLSX_MIME, dialogTitle: 'Okana import template' });
      }
    } catch {
      // Best-effort — worst case the user just doesn't get the template
      // this time and can retry from the same Import Data entry point.
    } finally {
      setDownloadingTemplate(false);
    }
  }

  // One continuous flow, no intermediate confirm step: pick a file, read
  // it, import it, then drop the user onto Home where they can see the
  // result for themselves — with a full-screen green progress bar the
  // whole way through instead of leaving this page looking unresponsive.
  async function pickImportFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [XLSX_MIME, 'application/vnd.ms-excel'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;

      if (!isOnline) { notifyOffline(); return; }

      setImportErrorMsg('');
      setImportFormatError(false);
      setImportStage('reading');
      // A small kick so the bar visibly moves even during the read/parse
      // step, which has no real sub-progress to report.
      importProgress.value = withTiming(0.08, { duration: 400, easing: SETTLE_EASING });
      // Yields so "Reading file…" actually paints before the synchronous,
      // CPU-heavy XLSX parse below blocks the JS thread — RN has no worker
      // thread to offload it to, so without this the UI would look frozen
      // with zero feedback for however long the parse takes.
      await new Promise(resolve => setTimeout(resolve, 50));

      const base64 = await FileSystem.readAsStringAsync(result.assets[0].uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const { parsed, skipped } = parseTransactionsWorkbook(base64);
      if (!parsed.length) {
        setImportErrorMsg(skipped.length
          ? "Couldn't read any valid rows — check the Date, Type, and Amount columns."
          : 'That file has no transaction rows.');
        setImportFormatError(true);
        setImportStage('error');
        return;
      }

      setImportStage('importing');
      importProgress.value = withTiming(0.15, { duration: 600, easing: SETTLE_EASING });

      const importStartedAt = Date.now();
      const res = await importTransactions(parsed, (done, total) => {
        importProgress.value = withTiming(done / total, { duration: 500, easing: SETTLE_EASING });
      });

      if (!res.success) {
        if (res.offline) { notifyOffline(); setImportStage('idle'); return; }
        setImportErrorMsg(res.error || 'Import failed. Please try again.');
        setImportStage('error');
        return;
      }

      // A fast, small import (the common case — one chunk, one quick
      // network round-trip) could otherwise jump from a sliver of progress
      // straight to done in well under a second, reading as rushed rather
      // than a real, deliberate progress bar.
      const MIN_IMPORTING_MS = 1000;
      const elapsed = Date.now() - importStartedAt;
      if (elapsed < MIN_IMPORTING_MS) {
        await new Promise(resolve => setTimeout(resolve, MIN_IMPORTING_MS - elapsed));
      }

      importProgress.value = withTiming(1, { duration: 400, easing: SETTLE_EASING });
      setImportMessage(
        `Imported ${res.imported} transaction${res.imported === 1 ? '' : 's'}`
        + (skipped.length ? ` — ${skipped.length} row${skipped.length === 1 ? '' : 's'} skipped` : '')
      );
      setImportStage('done');

      importRedirectTimeoutRef.current = setTimeout(() => {
        setImportStage('idle');
        router.replace('/(app)');
      }, 1700);
    } catch (err) {
      if (isConnectivityError(err, isOnlineRef.current)) { notifyOffline(); setImportStage('idle'); return; }
      // Reaching here almost always means parseTransactionsWorkbook rejected
      // the file itself (not a real xlsx) rather than some other failure —
      // treat it the same as a format mismatch.
      setImportErrorMsg(err.message || 'Something went wrong. Please try again.');
      setImportFormatError(true);
      setImportStage('error');
    }
  }

  return (
    <View className="flex-1 bg-bg">
      <ScrollView showsVerticalScrollIndicator={false}>
        <View className="flex-row items-center gap-2 px-4 pt-14 pb-4">
          <Pressable onPress={() => router.back()} className="w-9 h-9 items-center justify-center rounded-xl">
            <BackIcon />
          </Pressable>
          <Text className="text-white text-base font-semibold">Settings</Text>
        </View>

        <View className="items-center py-6">
          <AvatarPhoto uri={profile?.avatar} phase={avatarPhase} onPress={pickAndUploadAvatar} />
        </View>

        <View className="px-4" style={{ gap: 12 }}>
          <View>
            <Card>
              <View className="px-4 py-4">
                <Text className="text-white/40 text-xs font-medium mb-1">Name</Text>
                {editingName ? (
                  <View className="flex-row items-center" style={{ gap: 8 }}>
                    <TextInput
                      autoFocus
                      value={nameInput}
                      onChangeText={setNameInput}
                      onSubmitEditing={saveName}
                      className="flex-1 text-white text-base"
                      style={{ borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.2)', paddingBottom: 4 }}
                    />
                    <Pressable onPress={saveName} disabled={savingName}>
                      <Text className="text-base text-white/60">{savingName ? 'Saving…' : 'Save'}</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View className="flex-row items-center justify-between">
                    <Text className="text-white text-base">{profile?.name || '—'}</Text>
                    <Pressable onPress={() => { setNameInput(profile?.name || ''); setEditingName(true); }} className="w-7 h-7 items-center justify-center rounded-lg">
                      <EditIcon />
                    </Pressable>
                  </View>
                )}
              </View>

              <Divider />

              <View className="px-4 py-4">
                <Text className="text-white/40 text-xs font-medium mb-1">Email</Text>
                <Text className="text-white/60 text-base">{profile?.email || '—'}</Text>
              </View>
            </Card>
            {!!actionError && (
              <Text className="text-red-400 text-sm mt-2 px-1">{actionError}</Text>
            )}
          </View>

          <View>
            <SectionLabel>Subscription</SectionLabel>
            <Card>
              <Row
                label="Current Plan"
                onPress={() => router.push('/(app)/subscription')}
                right={
                  <View className="flex-row items-center" style={{ gap: 8 }}>
                    <Pill label={planLabel} tone={planTone} />
                    <ChevronRight />
                  </View>
                }
              />
            </Card>
          </View>

          <View>
            <SectionLabel>Data & Legal</SectionLabel>
            <Card>
              <Row
                label="Export Data"
                onPress={exportData}
                right={exporting
                  ? <Text className="text-white/35 text-xs">Exporting…</Text>
                  : <Text className="text-white/35 text-xs">XLSX</Text>}
              />
              <Divider />
              <Row
                label="Import Data"
                onPress={() => setImportOptionsOpen(true)}
                right={<Text className="text-white/35 text-xs">XLSX</Text>}
              />
              <Divider />
              <Row label="Privacy Policy" onPress={() => Linking.openURL('https://kushalbaragiokana.notion.site/Privacy-Policy-3c58f887c3c9806180c1ed51844d872e?source=copy_link')} />
              <Divider />
              <Row label="Terms & Conditions" onPress={() => Linking.openURL('https://kushalbaragiokana.notion.site/Terms-and-Condition-3c58f887c3c9806d86eae7473775949c?source=copy_link')} />
              <Divider />
              <Row label="Refunds & Cancellations" onPress={() => Linking.openURL('https://kushalbaragiokana.notion.site/Refund-Cancellation-Policy-3c58f887c3c980c48cb6ded1520897ed?source=copy_link')} />
            </Card>
            {!!exportError && (
              <Text className="text-red-400 text-sm mt-2 px-1">{exportError}</Text>
            )}
          </View>

          <View>
            <SectionLabel>Support</SectionLabel>
            <Card>
              <Row label="Developer" onPress={() => setModal('developer')} />
              <Divider />
              <Row label="Support" onPress={() => setModal('feedback')} />
              <Divider />
              <Row label="Rate Us" value="Coming soon" />
            </Card>
          </View>

          <View>
            <Pressable onPress={() => setShowLogoutConfirm(true)} className="self-start px-4 py-[14px]">
              <Text className="text-white/70 text-base">Log Out</Text>
            </Pressable>
            <Pressable
              onPress={() => (isOnline ? setShowEraseConfirm(true) : notifyOffline())}
              className="self-start px-4 py-[14px]"
            >
              <Text className="text-red-400 text-base">Erase Data</Text>
            </Pressable>
            <Pressable
              onPress={() => (isOnline ? setShowDeleteConfirm(true) : notifyOffline())}
              className="self-start px-4 py-[14px]"
            >
              <Text className="text-red-400 text-base">Delete Account</Text>
            </Pressable>
          </View>

          <Text className="text-white/25 text-xs text-center mt-2 mb-8">v{APP_VERSION}</Text>
        </View>
      </ScrollView>

      <InfoModal
        open={importOptionsOpen}
        title="Import Data"
        onClose={() => setImportOptionsOpen(false)}
        onClosed={handleImportOptionsClosed}
      >
        <Pressable
          onPress={() => { pendingAfterImportOptionsClose.current = 'template'; setImportOptionsOpen(false); }}
          disabled={downloadingTemplate}
          className="w-full px-4 py-4 rounded-2xl mb-3"
          style={{ backgroundColor: 'rgba(255,255,255,0.06)', opacity: downloadingTemplate ? 0.6 : 1 }}
        >
          <Text className="text-white text-base font-semibold mb-1">
            {downloadingTemplate ? 'Preparing…' : 'Get template'}
          </Text>
          <Text className="text-white/40 text-sm" style={{ lineHeight: 18 }}>
            Download an empty Excel file with the right columns.
          </Text>
        </Pressable>
        <Pressable
          onPress={() => { pendingAfterImportOptionsClose.current = 'file'; setImportOptionsOpen(false); }}
          className="w-full px-4 py-4 rounded-2xl"
          style={{ backgroundColor: '#ffffff' }}
        >
          <Text className="text-black text-base font-semibold mb-1">Import file</Text>
          <Text style={{ color: 'rgba(0,0,0,0.5)', fontSize: 14, lineHeight: 18 }}>
            Choose a file from your device to import.
          </Text>
        </Pressable>
      </InfoModal>

      <InfoModal open={modal === 'feedback'} title={feedbackSent ? '✓ Message sent!' : 'Support'} onClose={closeFeedbackModal}>
        {!feedbackSent && (
          <>
            <Text className="text-white/40 text-base mb-4" style={{ lineHeight: 22 }}>
              Need help, found a bug, or have a question? Let us know and we'll get back to you.
            </Text>
            <TextInput
              value={feedbackText}
              onChangeText={setFeedbackText}
              placeholder="How can we help?"
              placeholderTextColor="#4d4d4d"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              className="text-white text-base px-4 py-3 mb-4"
              style={{ minHeight: 100, borderRadius: 12, backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' }}
            />
            {!!feedbackError && <Text className="text-red-400 text-base mb-4">{feedbackError}</Text>}
            <Pressable
              onPress={sendFeedback}
              disabled={!feedbackText.trim() || feedbackSending}
              className="w-full py-[14px] rounded-2xl items-center"
              style={{ backgroundColor: '#ffffff', opacity: !feedbackText.trim() || feedbackSending ? 0.3 : 1 }}
            >
              <Text className="text-black text-base font-semibold">{feedbackSending ? 'Sending…' : 'Send'}</Text>
            </Pressable>
            <Text className="text-white/20 mt-3 text-center" style={{ fontSize: 12 }}>We typically respond within 1–2 business days.</Text>
          </>
        )}
      </InfoModal>

      <InfoModal open={modal === 'developer'} title="Developer" onClose={() => setModal(null)}>
        <View style={{ paddingVertical: 4 }}>
          <Image
            source={require('../../assets/developer-photo.jpg')}
            style={{ width: 84, height: 84, borderRadius: 16, marginBottom: 16 }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
          />
          <Text className="text-white font-semibold text-lg mb-3">Hi, I'm Kushal</Text>
          <Text className="text-white/50 text-base mb-3" style={{ lineHeight: 22 }}>
            I'm a software developer and creator from Karnataka. I build digital products, work mainly on the frontend, and enjoy turning simple ideas into useful things.
          </Text>
          <Text className="text-white/50 text-base mb-3" style={{ lineHeight: 22 }}>
            I also make YouTube videos about personal finance, technology, productivity, and minimal living. I like learning by building, sharing what I learn, and documenting the journey along the way.
          </Text>
          <Text className="text-white/50 text-base mb-5" style={{ lineHeight: 22 }}>
            I'm interested in technology, money, and creating a simpler life — and I'm always working on something new.
          </Text>

          <View className="flex-row" style={{ gap: 12 }}>
            <Pressable
              onPress={() => Linking.openURL('https://instagram.com/kushalbaragi')}
              className="flex-row items-center px-4 py-2 rounded-xl"
              style={{ gap: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}
            >
              <InstagramIcon />
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Instagram</Text>
            </Pressable>
            <Pressable
              onPress={() => Linking.openURL('https://www.youtube.com/@kushalbaragi')}
              className="flex-row items-center px-4 py-2 rounded-xl"
              style={{ gap: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}
            >
              <YouTubeIcon />
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>YouTube</Text>
            </Pressable>
          </View>

          <Text className="text-white/20 mt-5" style={{ fontSize: 12 }}>Okana v{APP_VERSION} · Made with ♥ in India</Text>
        </View>
      </InfoModal>

      <ConfirmModal
        open={showLogoutConfirm}
        title="Log Out?"
        message="You can sign back in anytime with your email — nothing is deleted."
        confirmLabel="Log Out"
        tone="neutral"
        onConfirm={() => { setShowLogoutConfirm(false); handleLogout(); }}
        onCancel={() => setShowLogoutConfirm(false)}
      />

      <ConfirmModal
        open={showEraseConfirm}
        title="Erase All Data"
        message="This will permanently delete all your transactions. This cannot be undone."
        confirmLabel="Erase Data"
        onConfirm={confirmErase}
        onCancel={() => setShowEraseConfirm(false)}
        onClosed={handleEraseConfirmClosed}
      />

      <ConfirmModal
        open={showDeleteConfirm}
        title="Delete Account"
        message={
          hasRealSubscription
            ? `Your account and all data will be permanently deleted. This cannot be undone. Deleting your account does not cancel your ${Platform.OS === 'ios' ? 'App Store' : 'Play Store'} subscription — cancel it separately in ${Platform.OS === 'ios' ? 'Settings' : 'Play Store'} or you'll keep being charged with no account to use it.`
            : 'Your account and all data will be permanently deleted. This cannot be undone.'
        }
        confirmLabel="Delete Account"
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
        onClosed={handleDeleteConfirmClosed}
      />

      {actionFlow && (
        <DeleteAccountOverlay
          type={actionFlow.type}
          phase={actionFlow.phase}
          onDone={actionFlow.type === 'erase' ? handleEraseDone : handleDeleteDone}
          subscriptionWarning={actionFlow.type === 'delete' && hasRealSubscription}
        />
      )}

      {importStage !== 'idle' && (
        <View
          pointerEvents="auto"
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32,
          }}
        >
          <View style={{ width: '100%', maxWidth: 300 }}>
            {importStage === 'error' ? (
              <>
                <Text className="text-white text-base font-semibold mb-2 text-center">
                  {importFormatError ? "Template doesn't match" : 'Import failed'}
                </Text>
                <Text className="text-white/50 text-sm mb-5 text-center" style={{ lineHeight: 20 }}>
                  {importFormatError
                    ? 'Make sure your file matches the required Excel format.'
                    : importErrorMsg}
                </Text>
                {importFormatError ? (
                  <View style={{ gap: 8 }}>
                    <Pressable
                      onPress={downloadTemplate}
                      disabled={downloadingTemplate}
                      className="py-[13px] rounded-2xl items-center"
                      style={{ backgroundColor: '#ffffff', opacity: downloadingTemplate ? 0.6 : 1 }}
                    >
                      <Text className="text-black text-base font-semibold">
                        {downloadingTemplate ? 'Preparing…' : 'Download template'}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setImportStage('idle')}
                      className="py-[13px] rounded-2xl items-center"
                      style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
                    >
                      <Text className="text-white text-base font-medium">Cancel</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => setImportStage('idle')}
                    className="py-[13px] rounded-2xl items-center"
                    style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
                  >
                    <Text className="text-white text-base font-medium">Dismiss</Text>
                  </Pressable>
                )}
              </>
            ) : (
              <>
                <Text className="text-white text-base font-medium mb-4 text-center">
                  {importStage === 'reading' && 'Reading file…'}
                  {importStage === 'importing' && 'Importing transactions…'}
                  {importStage === 'done' && importMessage}
                </Text>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden', width: '100%' }}>
                  <Animated.View style={[{ height: 8, borderRadius: 4, backgroundColor: '#4ade80' }, progressBarStyle]} />
                </View>
              </>
            )}
          </View>
        </View>
      )}

      <BottomBanner visible={noTransactionsBanner}>No transactions to export yet</BottomBanner>
    </View>
  );
}
