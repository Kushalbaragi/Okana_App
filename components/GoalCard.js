import { View, Text } from 'react-native';
import { GlassPressable } from './Glass';
import { CheckIcon, ChevronRight } from './icons';
import { Card, ProgressBar, ROUNDED_FONT, POSITIVE, dim, money } from './savingsShared';

// A goal on the list, as a card of its own: the name with its percent and the
// arrow that says it opens, the amount saved as the big number with "of goal"
// beside it, then a plain bar. Deliberately nothing else — the rest is on the
// goal's own page.
//
// A finished goal (`done`) is the same card with a tick by the name, dimmer
// figures and no bar: it is done, so the list stays quieter for it.
export function GoalCard({ goal, onPress, light = false, done = false }) {
  const figure = done ? dim(light, 0.6) : light ? '#111111' : '#ffffff';
  const content = (
    <>
      <View className="flex-row items-center justify-between" style={{ gap: 12 }}>
        <View className="flex-row items-center" style={{ gap: 8, flexShrink: 1 }}>
          {done && <CheckIcon size={14} color={POSITIVE} />}
          <Text className="text-[15px]" numberOfLines={1} style={{ flexShrink: 1, color: dim(light, done ? 0.5 : 0.4) }}>{goal.name}</Text>
        </View>
        <View className="flex-row items-center" style={{ gap: 6 }}>
          <View style={{ backgroundColor: 'rgba(74,222,128,0.14)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
            <Text className="text-[13px] font-medium" style={{ color: '#4ade80' }}>{goal.percent}%</Text>
          </View>
          <ChevronRight color={dim(light, 0.3)} />
        </View>
      </View>
      <View className="flex-row items-baseline" style={{ gap: 8, marginTop: 8, marginBottom: done ? 0 : 12 }}>
        <Text style={{ fontSize: 24, fontWeight: '600', letterSpacing: -0.5, color: figure, fontFamily: ROUNDED_FONT }}>{money(goal.saved)}</Text>
        <Text className="text-[13px]" numberOfLines={1} style={{ flexShrink: 1, color: dim(light, 0.4) }}>of {money(goal.target)}</Text>
      </View>
      {!done && <ProgressBar percent={goal.percent} height={5} light={light} />}
    </>
  );

  return (
    <View style={{ marginBottom: 10 }}>
      <Card light={light}>
        <GlassPressable
          variant="field"
          pressScale={false}
          onPress={() => onPress(goal.id)}
          style={{ padding: 16 }}
          accessibilityRole="button"
          accessibilityLabel={done ? `${goal.name}, completed` : goal.name}
        >
          {content}
        </GlassPressable>
      </Card>
    </View>
  );
}
