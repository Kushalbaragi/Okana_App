import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Platform } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Circle } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedStyle, useAnimatedProps, withDelay, withSequence, withTiming, Easing } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { isConnectivityError } from '../../utils/errors';
import { useSubscription } from '../../hooks/useSubscription';
import { openManageSubscription } from '../../hooks/usePurchases';
import { getSubscriptionDisplayStatus } from '../../utils/trial';
import { today } from '../../utils/format';
import { supabase } from '../../lib/supabase';
import { BackIcon, EditIcon, ChevronRight, CheckIcon, CameraIcon } from '../../components/icons';
import { ONBOARDING_SEEN_KEY } from '../onboarding';
import { AnimatedModal } from '../../components/AnimatedModal';
import { ActionOverlay } from '../../components/ActionOverlay';

function Divider() {
  return <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginHorizontal: 16 }} />;
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

function ConfirmModal({ open, title, message, confirmLabel, onConfirm, onCancel, onClosed }) {
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
          <Pressable onPress={onConfirm} className="flex-1 py-3 rounded-xl items-center" style={{ backgroundColor: 'rgba(248,113,113,0.14)' }}>
            <Text className="text-base font-semibold" style={{ color: 'rgba(248,113,113,0.9)' }}>{confirmLabel}</Text>
          </Pressable>
        </View>
      </View>
    </AnimatedModal>
  );
}

const SUCCESS_HOLD_MS = 3000;
// Longer hold specifically for a delete that leaves an active native
// subscription behind — long enough to actually read the warning and tap
// through to Settings before this auto-advances to logout.
const SUBSCRIPTION_WARNING_HOLD_MS = 10000;

const ACTION_COPY = {
  erase:  { working: 'Erasing your data',     success: 'Data erased' },
  delete: { working: 'Deleting your account', success: 'Account deleted' },
};

// `subscriptionWarning` (delete only) shows a reminder + deep link to
// Settings, since deleting the account never cancels an active native
// subscription — see runDelete's comment for why that's not possible here.
function DeleteAccountOverlay({ type, phase, onDone, subscriptionWarning }) {
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
            onPress={openManageSubscription}
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

export default function AccountPage() {
  const router = useRouter();
  const { user, profile, logout } = useAuth();
  const { isOnline, notifyOffline } = useNetwork();
  const { subscription } = useSubscription(user);
  const hasActivePlus = ['trial', 'subscribed'].includes(getSubscriptionDisplayStatus(subscription, today()).status);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(profile?.name || '');
  const [savingName, setSavingName] = useState(false);
  const [avatarPhase, setAvatarPhase] = useState('idle'); // 'idle' | 'uploading' | 'success'

  const [showEraseConfirm, setShowEraseConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // { type: 'erase' | 'delete', phase: 'working' | 'success' } | null — one
  // flow at a time, since only one of Erase/Delete can be in progress.
  const [actionFlow, setActionFlow] = useState(null);
  const [actionError, setActionError] = useState('');

  // Opening ActionOverlay before its ConfirmModal has actually finished
  // closing means two native <Modal>s mounted at once — broken on Android
  // (same issue fixed on the Dashboard's calendar/budget/recap flow). Stash
  // which action to run and let ConfirmModal's onClosed — fired only once
  // it's truly gone — trigger it.
  const pendingAfterConfirmClose = useRef(null); // 'erase' | 'delete' | null

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

  return (
    <View className="flex-1 bg-bg">
      <ScrollView>
        <View className="flex-row items-center gap-2 px-4 pt-14 pb-4">
          <Pressable onPress={() => router.back()} className="w-9 h-9 items-center justify-center rounded-xl">
            <BackIcon />
          </Pressable>
          <Text className="text-white text-base font-semibold">Account</Text>
        </View>

        <View className="items-center py-6">
          <AvatarPhoto uri={profile?.avatar} phase={avatarPhase} onPress={pickAndUploadAvatar} />
        </View>

        <View className="mx-4 rounded-2xl overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' }}>
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
        </View>

        <View className="mx-4 mt-4 rounded-2xl overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' }}>
          <Pressable
            onPress={() => (isOnline ? setShowEraseConfirm(true) : notifyOffline())}
            className="flex-row items-center justify-between px-4 py-4"
          >
            <Text className="text-red-400 text-base">Erase Data</Text>
            <ChevronRight />
          </Pressable>
          <Divider />
          <Pressable
            onPress={() => (isOnline ? setShowDeleteConfirm(true) : notifyOffline())}
            className="flex-row items-center justify-between px-4 py-4"
          >
            <Text className="text-red-400 text-base">Delete Account</Text>
            <ChevronRight />
          </Pressable>
        </View>

        {!!actionError && (
          <Text className="text-red-400 text-base text-center mx-4 mt-3 mb-8">{actionError}</Text>
        )}
        {!actionError && <View className="mb-8" />}
      </ScrollView>

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
          hasActivePlus
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
          subscriptionWarning={actionFlow.type === 'delete' && hasActivePlus}
        />
      )}
    </View>
  );
}
