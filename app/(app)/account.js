import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Image } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withSequence, withTiming, Easing } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../hooks/useSubscription';
import { supabase } from '../../lib/supabase';
import { BackIcon, EditIcon, EyeIcon, ChevronRight, CheckIcon } from '../../components/icons';
import { GlassView, GlassTextInput, GlassPressable } from '../../components/Glass';
import { ONBOARDING_SEEN_KEY } from '../onboarding';
import { AnimatedModal } from '../../components/AnimatedModal';

function Divider() {
  return <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginHorizontal: 16 }} />;
}

function ChangePasswordModal({ open, onClose }) {
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSave() {
    setError('');
    if (newPw.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (newPw !== confirmPw) { setError('Passwords do not match'); return; }
    setSaving(true);
    const { error: err } = await supabase.auth.updateUser({ password: newPw });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setDone(true);
    setTimeout(() => { setDone(false); setNewPw(''); setConfirmPw(''); onClose(); }, 1200);
  }

  function handleClose() {
    setNewPw(''); setConfirmPw(''); setError(''); setDone(false); onClose();
  }

  return (
    <AnimatedModal open={open} onClose={handleClose} variant="bottom">
      <GlassView variant="modal" radius={24} corners="t" className="px-6 pt-5 pb-10">
        <View className="w-8 h-1 rounded-full mx-auto mb-5" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }} />
        <Text className="text-white font-semibold text-base mb-5">{done ? '✓ Password updated' : 'Change Password'}</Text>

        {!done && (
          <>
            <View className="mb-4" style={{ position: 'relative' }}>
              <Text className="text-white text-[15px] font-medium mb-2">New Password</Text>
              <GlassTextInput value={newPw} onChangeText={setNewPw} placeholder="••••••••" secureTextEntry={!showNew} />
              <Pressable onPress={() => setShowNew(v => !v)} style={{ position: 'absolute', right: 12, top: 30, bottom: 0, justifyContent: 'center' }}>
                <EyeIcon open={showNew} />
              </Pressable>
            </View>

            <View className="mb-5" style={{ position: 'relative' }}>
              <Text className="text-white text-[15px] font-medium mb-2">Confirm Password</Text>
              <GlassTextInput value={confirmPw} onChangeText={setConfirmPw} placeholder="••••••••" secureTextEntry={!showConfirm} />
              <Pressable onPress={() => setShowConfirm(v => !v)} style={{ position: 'absolute', right: 12, top: 30, bottom: 0, justifyContent: 'center' }}>
                <EyeIcon open={showConfirm} />
              </Pressable>
            </View>

            {!!error && <Text className="text-red-400 text-base mb-4">{error}</Text>}

            <GlassPressable
              variant="active"
              radius={16}
              disabled={saving || !newPw || !confirmPw}
              onPress={handleSave}
              className="w-full py-[14px] items-center"
            >
              <Text className="text-black text-base font-semibold">{saving ? 'Saving…' : 'Update Password'}</Text>
            </GlassPressable>
          </>
        )}
      </GlassView>
    </AnimatedModal>
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

const COUNTDOWN_FROM = 5;

function SuccessOverlay({ open, title, redirectTo, onDone }) {
  const [count, setCount] = useState(COUNTDOWN_FROM);
  const scale = useSharedValue(0);

  // Ticks the countdown down to 1 while the overlay is showing, then fires
  // onDone — gives the user time to actually read the confirmation instead
  // of the redirect happening almost instantly.
  useEffect(() => {
    if (!open) { setCount(COUNTDOWN_FROM); return; }
    const t = setTimeout(() => {
      if (count <= 1) { onDone?.(); return; }
      setCount(c => c - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [open, count, onDone]);

  // A small overshoot "pop" on the checkmark each time this opens, rather
  // than just relying on AnimatedModal's own fade/scale-in for the whole card.
  // Delayed slightly so it starts once the modal itself has mostly settled
  // in (its own entrance runs ~380ms) instead of both animating at once —
  // reads as one deliberate sequence rather than two competing motions.
  useEffect(() => {
    if (!open) { scale.value = 0; return; }
    scale.value = withDelay(200, withSequence(
      withTiming(1.12, { duration: 420, easing: Easing.out(Easing.back(1.4)) }),
      withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) }),
    ));
  }, [open, scale]);

  const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedModal open={open} onClose={() => {}} variant="center">
      <View className="items-center">
        <Animated.View
          className="w-16 h-16 rounded-full items-center justify-center mb-5"
          style={[{ backgroundColor: 'rgba(74,222,128,0.12)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)' }, checkStyle]}
        >
          <CheckIcon size={28} />
        </Animated.View>
        <Text className="text-white font-semibold text-base">{title}</Text>
        <Text className="text-white/40 text-base mt-1">Redirecting to {redirectTo} page in {count}</Text>
      </View>
    </AnimatedModal>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const { user, profile, logout } = useAuth();
  const { subscription, cancelSubscription } = useSubscription(user);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(profile?.name || '');
  const [savingName, setSavingName] = useState(false);

  const [showPwModal, setShowPwModal] = useState(false);
  const [showEraseConfirm, setShowEraseConfirm] = useState(false);
  const [eraseSuccess, setEraseSuccess] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState('');

  // Opening SuccessOverlay before its ConfirmModal has actually finished
  // closing means two native <Modal>s mounted at once — broken on Android
  // (same issue fixed on the Dashboard's calendar/budget/recap flow). Stash
  // which success state to show and let ConfirmModal's onClosed — fired only
  // once it's truly gone — trigger it.
  const pendingAfterConfirmClose = useRef(null); // 'erase' | 'delete' | null

  async function saveName() {
    if (!nameInput.trim() || nameInput.trim() === profile?.name) { setEditingName(false); return; }
    setSavingName(true);
    await supabase.auth.updateUser({ data: { name: nameInput.trim() } });
    setSavingName(false);
    setEditingName(false);
  }

  async function handleEraseData() {
    setWorking(true);
    setActionError('');
    try {
      const { error: txError } = await supabase.from('transactions').delete().eq('user_id', user.id);
      if (txError) throw txError;
      const { error: budgetError } = await supabase.from('monthly_budgets').delete().eq('user_id', user.id);
      if (budgetError) throw budgetError;
      // Lets the budget-setup popup fire again on the next Dashboard visit —
      // otherwise the "already shown this month" flag would keep suppressing
      // it even though there's no budget anymore.
      await AsyncStorage.removeItem(`okana_budget_setup_shown_${user.id}`);
      pendingAfterConfirmClose.current = 'erase';
      setShowEraseConfirm(false);
    } catch (err) {
      setShowEraseConfirm(false);
      setActionError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setWorking(false);
    }
  }

  async function handleDeleteAccount() {
    setWorking(true);
    setActionError('');
    try {
      const TERMINAL = ['cancelled', 'expired', 'completed'];
      if (subscription && !TERMINAL.includes(subscription.status)) {
        await cancelSubscription({ immediate: true });
      }
      const { error: txError } = await supabase.from('transactions').delete().eq('user_id', user.id);
      if (txError) throw txError;
      // monthly_budgets has a (no-cascade) FK to auth.users — must be cleared
      // before delete_user() or the account delete itself fails.
      const { error: budgetError } = await supabase.from('monthly_budgets').delete().eq('user_id', user.id);
      if (budgetError) throw budgetError;
      const { error: rpcError } = await supabase.rpc('delete_user');
      if (rpcError) throw rpcError;
      pendingAfterConfirmClose.current = 'delete';
      setShowDeleteConfirm(false);
    } catch (err) {
      setShowDeleteConfirm(false);
      setActionError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setWorking(false);
    }
  }

  const handleEraseConfirmClosed = useCallback(() => {
    if (pendingAfterConfirmClose.current !== 'erase') return;
    pendingAfterConfirmClose.current = null;
    setEraseSuccess(true);
  }, []);

  const handleDeleteConfirmClosed = useCallback(() => {
    if (pendingAfterConfirmClose.current !== 'delete') return;
    pendingAfterConfirmClose.current = null;
    setDeleteSuccess(true);
  }, []);

  const handleEraseDone = useCallback(() => {
    setEraseSuccess(false);
    router.back();
  }, [router]);

  const handleDeleteDone = useCallback(async () => {
    setDeleteSuccess(false);
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
    await logout();
  }, [router, logout]);

  const initials = (profile?.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <View className="flex-1 bg-bg">
      <ScrollView>
        <View className="flex-row items-center gap-2 px-4 pt-14 pb-4">
          <Pressable onPress={() => router.back()} className="w-9 h-9 items-center justify-center rounded-xl">
            <BackIcon />
          </Pressable>
          <Text className="text-white text-base font-semibold">Account</Text>
        </View>

        {/* Avatar — static display only; upload w/ progress-ring + blur-crossfade
            animation is deferred (see plan Step 7) */}
        <View className="items-center py-6">
          {profile?.avatar ? (
            <Image
              source={{ uri: profile.avatar }}
              style={{ width: 80, height: 80, borderRadius: 40, borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)' }}
            />
          ) : (
            <View
              className="w-20 h-20 rounded-full items-center justify-center"
              style={{ backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)' }}
            >
              <Text className="text-white text-2xl font-semibold">{initials}</Text>
            </View>
          )}
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

          <Divider />

          <View className="px-4 py-4">
            <Text className="text-white/40 text-xs font-medium mb-1">Password</Text>
            <View className="flex-row items-center justify-between">
              <Text className="text-white text-base" style={{ letterSpacing: 2 }}>••••••••</Text>
              <Pressable onPress={() => setShowPwModal(true)} className="w-7 h-7 items-center justify-center rounded-lg">
                <EditIcon />
              </Pressable>
            </View>
          </View>
        </View>

        <View className="mx-4 mt-4 rounded-2xl overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' }}>
          <Pressable onPress={() => setShowEraseConfirm(true)} className="flex-row items-center justify-between px-4 py-4">
            <Text className="text-red-400 text-base">Erase Data</Text>
            <ChevronRight />
          </Pressable>
          <Divider />
          <Pressable onPress={() => setShowDeleteConfirm(true)} className="flex-row items-center justify-between px-4 py-4">
            <Text className="text-red-400 text-base">Delete Account</Text>
            <ChevronRight />
          </Pressable>
        </View>

        {!!actionError && (
          <Text className="text-red-400 text-base text-center mx-4 mt-3 mb-8">{actionError}</Text>
        )}
        {!actionError && <View className="mb-8" />}
      </ScrollView>

      <ChangePasswordModal open={showPwModal} onClose={() => setShowPwModal(false)} />

      <ConfirmModal
        open={showEraseConfirm}
        title="Erase All Data"
        message="This will permanently delete all your transactions. This cannot be undone."
        confirmLabel={working ? 'Erasing…' : 'Erase Data'}
        onConfirm={handleEraseData}
        onCancel={() => setShowEraseConfirm(false)}
        onClosed={handleEraseConfirmClosed}
      />

      <ConfirmModal
        open={showDeleteConfirm}
        title="Delete Account"
        message="Your account and all data will be permanently deleted. This cannot be undone."
        confirmLabel={working ? 'Deleting…' : 'Delete Account'}
        onConfirm={handleDeleteAccount}
        onCancel={() => setShowDeleteConfirm(false)}
        onClosed={handleDeleteConfirmClosed}
      />

      <SuccessOverlay open={eraseSuccess} title="Data erased" redirectTo="Home" onDone={handleEraseDone} />
      <SuccessOverlay open={deleteSuccess} title="Account deleted" redirectTo="Login" onDone={handleDeleteDone} />
    </View>
  );
}
