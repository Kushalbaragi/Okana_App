import { View, Text } from 'react-native';
import { GlassPressable } from './Glass';
import ErrorBoundary from './ErrorBoundary';
import { dim } from './savingsShared';

function SavingsFallback({ onRetry, light }) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <Text className="text-lg font-semibold text-center" style={{ color: light ? '#111111' : '#ffffff' }}>Couldn't load your savings</Text>
      <Text className="text-center" style={{ color: dim(light, 0.5), marginTop: 8, marginBottom: 24, lineHeight: 22 }}>
        Your data is safe. Try again, and if it keeps happening, restart the app.
      </Text>
      <GlassPressable variant="active" radius={9999} onPress={onRetry} accessibilityRole="button" style={{ paddingHorizontal: 32, paddingVertical: 12, alignItems: 'center' }}>
        <Text className="text-black text-[15px] font-semibold">Try again</Text>
      </GlassPressable>
    </View>
  );
}

// The savings section and everything it draws. If it crashes, the header and
// the Budget section stay usable and this says so with a way to retry;
// `onReset` lets the caller put the section back at its start (closing an open
// goal, say) so a retry doesn't land straight back on whatever crashed.
export default function SavingsBoundary({ onReset, light = false, children }) {
  return (
    <ErrorBoundary onReset={onReset} fallback={({ reset }) => <SavingsFallback onRetry={reset} light={light} />}>
      {children}
    </ErrorBoundary>
  );
}
