import { memo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { AnimatedModal } from './AnimatedModal';

const TONE_STYLES = {
  positive: { bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.25)', button: 'rgba(74,222,128,0.16)', text: '#4ade80' },
  neutral:  { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.10)', button: 'rgba(255,255,255,0.10)', text: 'rgba(255,255,255,0.8)' },
  nudge:    { bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.22)', button: 'rgba(251,191,36,0.14)', text: '#fbbf24' },
};

function DailyInsightModal({ insight, onClose }) {
  const open = !!insight;
  const tone = TONE_STYLES[insight?.tone] || TONE_STYLES.neutral;

  return (
    <AnimatedModal open={open} onClose={onClose} variant="center">
      {insight && (
        <View
          className="w-full rounded-3xl px-6 py-7 items-center"
          style={{ maxWidth: 320, backgroundColor: '#1c1c1f', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <View
            className="w-14 h-14 rounded-full items-center justify-center mb-4"
            style={{ backgroundColor: tone.bg, borderWidth: 1, borderColor: tone.border }}
          >
            <Text style={{ fontSize: 24 }}>{insight.emoji}</Text>
          </View>

          <Text className="text-white text-base font-semibold mb-2">{insight.headline}</Text>
          <Text className="text-white/50 text-base text-center mb-6" style={{ lineHeight: 22 }}>{insight.message}</Text>

          <Pressable
            onPress={onClose}
            className="w-full py-3 rounded-2xl items-center"
            style={{ backgroundColor: tone.button }}
          >
            <Text className="text-base font-semibold" style={{ color: tone.text }}>Got it</Text>
          </Pressable>
        </View>
      )}
    </AnimatedModal>
  );
}

export default memo(DailyInsightModal);
