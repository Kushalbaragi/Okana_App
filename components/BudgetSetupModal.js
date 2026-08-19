import { memo, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { AnimatedModal } from './AnimatedModal';

function BudgetSetupModal({ open, onClose, onSubmit }) {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) { setAmount(''); setError(''); }
  }, [open]);

  const parsed = parseFloat(amount);
  const canSubmit = !!amount && parsed > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    const result = await onSubmit(parsed);
    setSubmitting(false);
    if (result?.success === false) { setError(result.error || 'Something went wrong. Please try again.'); return; }
    onClose();
  }

  return (
    <AnimatedModal open={open} onClose={onClose} variant="center">
      <View
        className="w-full rounded-3xl px-6 py-7 items-center"
        style={{ maxWidth: 320, backgroundColor: '#1c1c1f', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}
      >
        <Text className="text-white text-base font-semibold mb-2 text-center">Set your budget for this month</Text>
        <Text className="text-white/50 text-base text-center mb-6" style={{ lineHeight: 22 }}>
          How much do you want to spend this month?
        </Text>

        <View className="flex-row items-center justify-center gap-1 mb-6">
          <Text className="text-4xl font-light text-white/35" style={{ lineHeight: 56 }}>₹</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            placeholder="0"
            placeholderTextColor="#333333"
            keyboardType="decimal-pad"
            autoFocus
            className="font-semibold text-center text-white"
            style={{ minWidth: 120, fontSize: 48, lineHeight: 56 }}
          />
        </View>

        {!!error && <Text className="text-red-400 text-base text-center mb-4">{error}</Text>}

        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          className="w-full py-3 rounded-2xl items-center"
          style={{ backgroundColor: 'rgba(74,222,128,0.16)', opacity: canSubmit ? 1 : 0.5 }}
        >
          <Text className="text-base font-semibold" style={{ color: '#4ade80' }}>{submitting ? 'Setting…' : 'Set Budget'}</Text>
        </Pressable>

        <Pressable onPress={onClose} className="mt-4 py-1">
          <Text className="text-white/35 text-base">Skip</Text>
        </Pressable>
      </View>
    </AnimatedModal>
  );
}

export default memo(BudgetSetupModal);
