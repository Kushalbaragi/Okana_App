import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../hooks/useSubscription';
import { supabase } from '../../lib/supabase';
import { BackIcon, EditIcon, EyeIcon, ChevronRight, CheckIcon } from '../../components/icons';
import { GlassView, GlassTextInput, GlassPressable } from '../../components/Glass';
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
              <Text className="text-white/35 text-sm font-medium uppercase tracking-wider mb-2">New Password</Text>
              <GlassTextInput value={newPw} onChangeText={setNewPw} placeholder="••••••••" secureTextEntry={!showNew} />
              <Pressable onPress={() => setShowNew(v => !v)} style={{ position: 'absolute', right: 12, top: 30, bottom: 0, justifyContent: 'center' }}>
                <EyeIcon open={showNew} />
              </Pressable>
            </View>

            <View className="mb-5" style={{ position: 'relative' }}>
              <Text className="text-white/35 text-sm font-medium uppercase tracking-wider mb-2">Confirm Password</Text>
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
              <Text className="text-white text-base font-semibold">{saving ? 'Saving…' : 'Update Password'}</Text>
            </GlassPressable>
          </>
        )}
      </GlassView>
    </AnimatedModal>
  );
}

function ConfirmModal({ open, title, message, confirmLabel, onConfirm, onCancel }) {
  return (
    <AnimatedModal open={open} onClose={onCancel} variant="center">
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

function SuccessOverlay({ open, title, subtitle }) {
  return (
    <AnimatedModal open={open} onClose={() => {}} variant="center" dim={0.85} blurIntensity={10}>
      <View className="items-center">
        <View
          className="w-16 h-16 rounded-full items-center justify-center mb-5"
          style={{ backgroundColor: 'rgba(74,222,128,0.12)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)' }}
        >
          <CheckIcon size={28} />
        </View>
        <Text className="text-white font-semibold text-base">{title}</Text>
        <Text className="text-white/40 text-base mt-1">{subtitle}</Text>
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

  async function saveName() {
    if (!nameInput.trim() || nameInput.trim() === profile?.name) { setEditingName(false); return; }
    setSavingName(true);
    await supabase.auth.updateUser({ data: { name: nameInput.trim() } });
    setSavingName(false);
    setEditingName(false);
  }

  async function handleEraseData() {
    setWorking(true);
    await supabase.from('transactions').delete().eq('user_id', user.id);
    setWorking(false);
    setShowEraseConfirm(false);
    setEraseSuccess(true);
    setTimeout(() => { setEraseSuccess(false); router.back(); }, 1500);
  }

  async function handleDeleteAccount() {
    setWorking(true);
    const TERMINAL = ['cancelled', 'expired', 'completed'];
    if (subscription && !TERMINAL.includes(subscription.status)) {
      await cancelSubscription({ immediate: true });
    }
    await supabase.from('transactions').delete().eq('user_id', user.id);
    await supabase.rpc('delete_user');
    setWorking(false);
    setShowDeleteConfirm(false);
    setDeleteSuccess(true);
    setTimeout(async () => {
      await logout();
      router.replace('/(auth)/login');
    }, 1800);
  }

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
            <Text className="text-white/35 text-sm font-medium uppercase tracking-wider mb-1">Name</Text>
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
            <Text className="text-white/35 text-sm font-medium uppercase tracking-wider mb-1">Email</Text>
            <Text className="text-white/60 text-base">{profile?.email || '—'}</Text>
          </View>

          <Divider />

          <View className="px-4 py-4">
            <Text className="text-white/35 text-sm font-medium uppercase tracking-wider mb-1">Password</Text>
            <View className="flex-row items-center justify-between">
              <Text className="text-white text-base" style={{ letterSpacing: 2 }}>••••••••</Text>
              <Pressable onPress={() => setShowPwModal(true)} className="w-7 h-7 items-center justify-center rounded-lg">
                <EditIcon />
              </Pressable>
            </View>
          </View>
        </View>

        <View className="mx-4 mt-4 mb-8 rounded-2xl overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' }}>
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
      </ScrollView>

      <ChangePasswordModal open={showPwModal} onClose={() => setShowPwModal(false)} />

      <ConfirmModal
        open={showEraseConfirm}
        title="Erase All Data"
        message="This will permanently delete all your transactions. This cannot be undone."
        confirmLabel={working ? 'Erasing…' : 'Erase Data'}
        onConfirm={handleEraseData}
        onCancel={() => setShowEraseConfirm(false)}
      />

      <ConfirmModal
        open={showDeleteConfirm}
        title="Delete Account"
        message="Your account and all data will be permanently deleted. This cannot be undone."
        confirmLabel={working ? 'Deleting…' : 'Delete Account'}
        onConfirm={handleDeleteAccount}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <SuccessOverlay open={eraseSuccess} title="Data erased" subtitle="Redirecting…" />
      <SuccessOverlay open={deleteSuccess} title="Account deleted" subtitle="Redirecting…" />
    </View>
  );
}
