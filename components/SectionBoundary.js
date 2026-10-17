import { View, Text } from 'react-native';
import { GlassPressable } from './Glass';
import ErrorBoundary from './ErrorBoundary';
import { dim, ink } from './savingsShared';

function SectionFallback({ what, onRetry, light, compact }) {
  return (
    <View className={compact ? 'items-center justify-center px-8 py-6' : 'flex-1 items-center justify-center px-8'}>
      <Text className={compact ? 'text-base font-semibold text-center' : 'text-xl font-semibold text-center'} style={{ color: ink(light) }}>
        Couldn't load {what}
      </Text>
      <Text className="text-center" style={{ color: dim(light, 0.5), marginTop: 8, marginBottom: compact ? 16 : 24, lineHeight: 22 }}>
        Your data is safe. Try again, and if it keeps happening, restart the app.
      </Text>
      <GlassPressable variant="active" radius={9999} onPress={onRetry} accessibilityRole="button" style={{ paddingHorizontal: 32, paddingVertical: 12, alignItems: 'center' }}>
        <Text className="text-black text-[16px] font-semibold">Try again</Text>
      </GlassPressable>
    </View>
  );
}

// One part of a screen and everything it draws. If it crashes, the rest of the
// screen stays usable and this says so in its place, with a way to retry (the
// crash is reported). `what` names the part ("your savings"); `compact` is for a
// part that isn't the whole screen; `onReset` lets the caller put the part back
// at its start (closing an open goal, say) so a retry doesn't land straight back
// on whatever crashed.
export default function SectionBoundary({ what, onReset, light = false, compact = false, children }) {
  return (
    <ErrorBoundary onReset={onReset} fallback={({ reset }) => <SectionFallback what={what} onRetry={reset} light={light} compact={compact} />}>
      {children}
    </ErrorBoundary>
  );
}
